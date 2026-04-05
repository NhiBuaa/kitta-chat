/**
 * Đăng ký WebRTC call signaling + Call History persistence handlers
 *
 * @param {import("socket.io").Socket} socket
 * @param {import("socket.io").Server} io
 */
const mongoose = require("mongoose");
const CallHistory = require("../../models/CallHistory");
const Message = require("../../models/Message");
const User = require("../../models/User");
const buildConversationId = require("../../utils/buildConversationId");

// CONSTAINS
const CALL_TIMEOUT_MS = 45_000;

// IN-MEMORY STATE
const activeTimeouts = new Map();

const callRateLimit = new Map();
const RATE_LIMIT_CALLS = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;

// HELPERS

/**
 * Kiểm tra và cập nhật rate limit cho user.
 * @returns {boolean} true = allowed, false = rate limited
 */
const checkRateLimit = (userId) => {
  const now = Date.now();
  const entry = callRateLimit.get(userId);

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    callRateLimit.set(userId, { count: 1, windowStart: now });
    return true;
  }

  if (entry.count >= RATE_LIMIT_CALLS) {
    return false;
  }

  entry.count++;
  return true;
};

/**
 * Tạo Message type:"call_log" gắn vào conversation.
 */
const createCallLogMessage = async (callRecord) => {
  try {
    const existing = await Message.findOne({ "callData.callHistoryId": callRecord._id });
    if (existing) {
      // Update status của message nếu call thay đổi (VD: pending → completed)
      if (existing.callData.status !== callRecord.status) {
        existing.callData.status = callRecord.status;
        existing.callData.duration = callRecord.duration;
        await existing.save();
      }
      return existing;
    }

    const message = new Message({
      conversationId: callRecord.conversationId,
      type: "call_log",
      sender: callRecord.callerId,
      receiver: callRecord.receiverId,
      text: "",
      attachments: [],
      callData: {
        callHistoryId: callRecord._id,
        type: callRecord.type,
        status: callRecord.status,
        startedAt: callRecord.startedAt,
        duration: callRecord.duration,
      },
    });

    const saved = await message.save();
    console.log(`[CallHandler] Created call_log message ${saved._id} for call ${callRecord._id}`);
    return saved;
  } catch (err) {
    console.error("[CallHandler] createCallLogMessage error:", err);
    return null;
  }
};

/**
 * Emit callHistorySync event đến cả caller và receiver.
 *
 *
 * @param {import("socket.io").Server} io
 * @param {Object} callRecord - MongoDB CallHistory document
 * @param {string} triggerUserId - userId trigger event
 */
const emitCallHistorySync = (io, callRecord, triggerUserId) => {
  try {
    const callerIdStr = callRecord.callerId?._id?.toString() || callRecord.callerId?.toString();
    const receiverIdStr = callRecord.receiverId?._id?.toString() || callRecord.receiverId?.toString();

    const isReadByCurrentUser = callRecord.readBy?.some(
      (id) => id.toString() === triggerUserId
    ) ?? false;

    const basePayload = {
      callId: callRecord._id.toString(),
      type: callRecord.type,
      status: callRecord.status,
      conversationId: callRecord.conversationId,
      callerId: callRecord.callerId,
      receiverId: callRecord.receiverId,
      startedAt: callRecord.startedAt,
      answeredAt: callRecord.answeredAt,
      endedAt: callRecord.endedAt,
      duration: callRecord.duration,
      isReadByCurrentUser,
    };

    // Emit đến caller
    io.to(callerIdStr).emit("callHistorySync", {
      ...basePayload,
      direction: callerIdStr === triggerUserId ? "outgoing" : "incoming",
    });

    // Emit đến receiver
    io.to(receiverIdStr).emit("callHistorySync", {
      ...basePayload,
      direction: receiverIdStr === triggerUserId ? "incoming" : "outgoing",
    });
  } catch (err) {
    console.error("[CallHandler] emitCallHistorySync error:", err);
  }
};

// CLEANUP
const runCleanup = async () => {
  if (mongoose.connection.readyState !== 1) return;

  try {
    const TWO_MINUTES_AGO = new Date(Date.now() - 2 * 60 * 1000);

    const result = await CallHistory.updateMany(
      { status: "pending", startedAt: { $lt: TWO_MINUTES_AGO } },
      { status: "unreachable", endedAt: new Date() }
    );
    if (result.modifiedCount > 0) {
      console.log(`[CallHandler] Cleanup: ${result.modifiedCount} pending → unreachable`);
    }
  } catch (err) {
    // Lỗi kết nối DB
    if (err.name !== "MongooseError") {
      console.error("[CallHandler] Cleanup error:", err.message);
    }
  }
};

// HANDLERS

const registerCallHandlers = (socket, io) => {
  const userId = socket.userId;

  // [callUser]
  socket.on("callUser", async ({ userToCall, signalData, from, name, mediaStatus, typeCall, avatar }) => {
    console.log(`[Call] callUser: ${userId} -> ${userToCall} (${typeCall})`);

    const authenticatedCallerId = userId;

    // Rate limit check
    if (!checkRateLimit(authenticatedCallerId)) {
      socket.emit("callRejected", { reason: "Too many calls. Please wait." });
      return;
    }

    if (!userToCall || !typeCall) {
      socket.emit("callRejected", { reason: "Invalid call parameters" });
      return;
    }

    try {
      const conversationId = buildConversationId(authenticatedCallerId, userToCall);

      // Tạo CallHistory record ngay khi bắt đầu gọi
      const callRecord = await CallHistory.create({
        callerId: new mongoose.Types.ObjectId(authenticatedCallerId),
        receiverId: new mongoose.Types.ObjectId(userToCall),
        conversationId,
        type: typeCall,
        status: "pending",
        startedAt: new Date(),
      });

      const callRecordId = callRecord._id.toString();

      // Gửi signal đến receiver nếu online
      const room = io.sockets.adapter.rooms.get(userToCall);
      if (room && room.size > 0) {
        const callerInfo = await User.findById(authenticatedCallerId)
          .select("_id displayName avatar username")
          .lean();

        io.to(userToCall).emit("callUser", {
          signal: signalData,
          from,
          callerDbId: authenticatedCallerId,
          name: callerInfo?.displayName || name,
          avatar: callerInfo?.avatar || avatar || "",
          mediaStatus,
          typeCall,
          callId: callRecordId,
        });
      } else {
        // Receiver offline -> ghi nhận unreachable NGAY LẬP TỨC, không chờ timeout
        await callRecord.updateOne({ status: "unreachable", endedAt: new Date() });
        await createCallLogMessage(callRecord);
        socket.emit("callRejected", { reason: "User offline" });
        return;
      }

      // Server-side timeout: 45s -> "missed"
      const timeoutId = setTimeout(async () => {
        try {
          const call = await CallHistory.findById(callRecordId).populate([
            { path: "callerId", select: "_id displayName avatar username" },
            { path: "receiverId", select: "_id displayName avatar username" },
          ]);
          if (call && call.status === "pending") {
            await call.updateOne({ status: "missed", endedAt: new Date() });
            const updated = await CallHistory.findById(callRecordId);
            await createCallLogMessage(updated);
            emitCallHistorySync(io, updated, authenticatedCallerId);
          }
        } catch (err) {
          console.error("[CallHandler] Timeout callback error:", err);
        } finally {
          activeTimeouts.delete(callRecordId);
        }
      }, CALL_TIMEOUT_MS);

      activeTimeouts.set(callRecordId, timeoutId);

    } catch (err) {
      console.error("[CallHandler] callUser error:", err);
      socket.emit("callRejected", { reason: "Server error" });
    }
  });

  // [answerCall]
  socket.on("answerCall", async ({ to, signal, mediaStatus, callId }) => {
    console.log(`[Call] answerCall: ${userId} → ${to}, callId: ${callId}`);

    if (callId) {
      const timeoutId = activeTimeouts.get(callId);
      if (timeoutId) {
        clearTimeout(timeoutId);
        activeTimeouts.delete(callId);
      }

      try {
        await CallHistory.findByIdAndUpdate(callId, { answeredAt: new Date() });
      } catch (err) {
        console.error("[CallHandler] answerCall update error:", err);
      }
    }

    io.to(to).emit("callAccepted", { signal, mediaStatus });
  });

  // [endCall]
  socket.on("endCall", async ({ to, callId }) => {
    console.log(`[Call] endCall: ${userId} -> ${to}, callId: ${callId}`);

    if (!callId) return;

    try {
      const call = await CallHistory.findById(callId);
      if (!call) return;

      // Đã kết thúc rồi -> ignore
      if (call.endedBy) {
        console.log(`[Call] endCall idempotent: call ${callId} already ended`);
        io.to(to).emit("callEnded");
        return;
      }

      // Cancel timeout nếu còn
      const timeoutId = activeTimeouts.get(callId);
      if (timeoutId) {
        clearTimeout(timeoutId);
        activeTimeouts.delete(callId);
      }

      const now = new Date();
      let duration = null;
      if (call.answeredAt) {
        duration = Math.round((now - call.answeredAt) / 1000);
      }

      const updated = await CallHistory.findByIdAndUpdate(
        callId,
        {
          status: "completed",
          endedBy: new mongoose.Types.ObjectId(userId),
          endedAt: now,
          duration,
        },
        { returnDocument: 'after' }
      ).populate([
        { path: "callerId", select: "_id displayName avatar username" },
        { path: "receiverId", select: "_id displayName avatar username" },
      ]);

      await createCallLogMessage(updated);
      emitCallHistorySync(io, updated, userId);
      io.to(to).emit("callEnded");

    } catch (err) {
      console.error("[CallHandler] endCall error:", err);
    }
  });

  // [rejectCall] 
  socket.on("rejectCall", async ({ to, callId, reason }) => {
    console.log(`[Call] rejectCall: ${userId} -> ${to}, callId: ${callId}, reason: ${reason}`);

    if (!callId) return;

    const timeoutId = activeTimeouts.get(callId);
    if (timeoutId) {
      clearTimeout(timeoutId);
      activeTimeouts.delete(callId);
    }

    try {
      const status = reason === "busy" ? "busy" : "rejected";

      const updated = await CallHistory.findByIdAndUpdate(
        callId,
        { status, endedAt: new Date() },
        { returnDocument: 'after' }
      ).populate([
        { path: "callerId", select: "_id displayName avatar username" },
        { path: "receiverId", select: "_id displayName avatar username" },
      ]);

      if (updated) {
        await createCallLogMessage(updated);
        emitCallHistorySync(io, updated, userId);
      }

      io.to(to).emit("callRejected", { reason: reason || "User busy" });
    } catch (err) {
      console.error("[CallHandler] rejectCall error:", err);
    }
  });

  // [toggleMedia]
  socket.on("toggleMedia", ({ to, cam, mic }) => {
    io.to(to).emit("updateMediaStatus", { cam, mic });
  });

  // [disconnect]
  // ⚠️ KHÔNG cancel timeout ở đây - call vẫn có thể tiếp tục từ thiết bị khác
  // (multi-device: user có thể có nhiều socket cùng lúc)
  socket.on("disconnect", () => {
    console.log(`[CallHandler] Socket disconnect: ${socket.id} (user: ${userId})`);
  });
};

// Init 
// Run cleanup ngay khi module load (khắc phục pending records từ lần chạy trước)
runCleanup();

// Auto-cleanup mỗi 60 giây
setInterval(runCleanup, 60_000);

module.exports = { registerCallHandlers };