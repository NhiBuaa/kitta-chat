/**
 * Đăng ký WebRTC call signaling + Call History persistence handlers
 *
 * @param {import("socket.io").Socket} socket
 * @param {import("socket.io").Server} io
 */
const mongoose = require("mongoose");
const CallHistory = require("../../../models/CallHistory");
const Message = require("../../../models/Message");
const User = require("../../../models/User");
const buildConversationId = require("../../../utils/buildConversationId");

// CONSTAINS
const CALL_TIMEOUT_MS = 45_000;

// IN-MEMORY STATE
const activeTimeouts = new Map();
const activeSocketCalls = new Map();
const tempIdToDbId = new Map();

const callRateLimit = new Map();
const RATE_LIMIT_CALLS = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;

const bindSocketToCall = (socketId, callId) => {
  if (!socketId || !callId) return;
  activeSocketCalls.set(socketId, callId);
};

const unbindSocketFromCall = (socketId) => {
  if (!socketId) return null;
  const callId = activeSocketCalls.get(socketId) || null;
  activeSocketCalls.delete(socketId);
  return callId;
};

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
      return await Message.findById(existing._id).populate([
        { path: "sender", select: "_id displayName avatar username" },
        { path: "receiver", select: "_id displayName avatar username" },
      ]);
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
    return await Message.findById(saved._id).populate([
      { path: "sender", select: "_id displayName avatar username" },
      { path: "receiver", select: "_id displayName avatar username" },
    ]);
  } catch (err) {
    console.error("[CallHandler] createCallLogMessage error:", err);
    return null;
  }
};

const emitCallLogMessage = (io, messageDoc) => {
  if (!messageDoc) return;

  const senderId = messageDoc.sender?._id?.toString() || messageDoc.sender?.toString();
  const receiverId = messageDoc.receiver?._id?.toString() || messageDoc.receiver?.toString();

  if (!senderId || !receiverId) return;

  const payload = {
    _id: messageDoc._id,
    conversationId: messageDoc.conversationId,
    type: messageDoc.type,
    sender: messageDoc.sender,
    senderId,
    receiver: messageDoc.receiver,
    receiverId,
    text: messageDoc.text || "",
    attachments: [],
    callData: messageDoc.callData,
    createdAt: messageDoc.createdAt,
  };

  io.to(senderId).emit("getMessage", payload);
  io.to(receiverId).emit("getMessage", payload);
  io.to(senderId).emit("callLogMessage", payload);
  io.to(receiverId).emit("callLogMessage", payload);
};

const emitCallEndedToParticipants = (io, callRecord, callId = null) => {
  try {
    const callerId = callRecord?.callerId?._id?.toString() || callRecord?.callerId?.toString();
    const receiverId = callRecord?.receiverId?._id?.toString() || callRecord?.receiverId?.toString();

    console.log(`[CallHandler] emitCallEndedToParticipants: callId=${callId}, caller=${callerId}, receiver=${receiverId}`);

    let emittedCount = 0;

    // Phương pháp 1: Emit đến userId rooms (thường hiệu quả)
    if (callerId) {
      io.to(callerId).emit("callEnded");
      emittedCount++;
      console.log(`[CallHandler] Emitted callEnded to caller room: ${callerId}`);
    }

    if (receiverId) {
      io.to(receiverId).emit("callEnded");
      emittedCount++;
      console.log(`[CallHandler] Emitted callEnded to receiver room: ${receiverId}`);
    }

    // Phương pháp 2: Emit đến bound socket IDs (fallback để chắc chắn)
    if (callId) {
      let boundCount = 0;
      for (const [socketId, boundCallId] of activeSocketCalls.entries()) {
        if (String(boundCallId) === String(callId)) {
          io.to(socketId).emit("callEnded");
          boundCount++;
          console.log(`[CallHandler] Emitted callEnded to bound socket: ${socketId}`);
        }
      }
      if (boundCount > 0) {
        console.log(`[CallHandler] Reached ${boundCount} bound sockets for callId ${callId}`);
      }
    }

    // Phương pháp 3: Broadcast đến ALL sockets của cả 2 bên (ultimate fallback)
    // Tìm tất cả sockets của caller và receiver trong Redis (multi-device support)
    if (callerId && receiverId) {
      const redisClient = io.redisClient;
      if (redisClient) {
        Promise.all([
          redisClient.sMembers(`user_sockets:${callerId}`),
          redisClient.sMembers(`user_sockets:${receiverId}`),
        ]).then(([callerSockets, receiverSockets]) => {
          [...callerSockets, ...receiverSockets].forEach((socketId) => {
            io.to(socketId).emit("callEnded");
          });
          if (callerSockets.length + receiverSockets.length > 0) {
            console.log(`[CallHandler] Fallback: Emitted to ${callerSockets.length + receiverSockets.length} device sockets`);
          }
        }).catch((err) => {
          console.error("[CallHandler] Redis fallback error:", err);
        });
      }
    }

    console.log(`[CallHandler] Total emitted: ${emittedCount} user rooms, callId=${callId}`);
  } catch (err) {
    console.error("[CallHandler] emitCallEndedToParticipants error:", err);
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

const finalizeCallFromDisconnect = async ({ socketId, userId, io }) => {
  const callId = unbindSocketFromCall(socketId);
  if (!callId) return;

  try {
    const existingCall = await CallHistory.findById(callId);
    if (!existingCall || existingCall.endedBy) return;

    const terminalStatuses = ["completed", "missed", "rejected", "busy", "unreachable"];
    if (terminalStatuses.includes(existingCall.status)) return;

    const timeoutId = activeTimeouts.get(callId);
    if (timeoutId) {
      clearTimeout(timeoutId);
      activeTimeouts.delete(callId);
    }

    const now = new Date();
    const duration = existingCall.answeredAt
      ? Math.round((now - existingCall.answeredAt) / 1000)
      : null;
    const status = existingCall.answeredAt ? "completed" : "rejected";

    const updatedCall = await CallHistory.findByIdAndUpdate(
      callId,
      {
        status,
        endedBy: new mongoose.Types.ObjectId(userId),
        endedAt: now,
        duration,
      },
      { returnDocument: "after" }
    ).populate([
      { path: "callerId", select: "_id displayName avatar username" },
      { path: "receiverId", select: "_id displayName avatar username" },
    ]);

    if (!updatedCall) return;

    const partnerId =
      updatedCall.callerId?._id?.toString() === String(userId)
        ? updatedCall.receiverId?._id?.toString()
        : updatedCall.callerId?._id?.toString();

    const callLogMessage = await createCallLogMessage(updatedCall);
    emitCallHistorySync(io, updatedCall, userId);
    emitCallLogMessage(io, callLogMessage);

    if (partnerId) {
      io.to(partnerId).emit("callEnded");
    }

    console.log(`[CallHandler] Finalized call ${callId} after disconnect of socket ${socketId}`);
  } catch (err) {
    console.error("[CallHandler] finalizeCallFromDisconnect error:", err);
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

  // [initCall] - Initialize call record BEFORE peer signal
  // Client calls this immediately to create record with tempCallId mapping
  socket.on("initCall", async ({ userToCall, typeCall, callId, from }) => {
    console.log(`[Call] initCall: ${userId} -> ${userToCall} (${typeCall}), tempCallId: ${callId}`);

    if (!callId || !callId.startsWith("temp_")) {
      console.warn(`[Call] initCall received invalid callId: ${callId}`);
      return;
    }

    try {
      const conversationId = buildConversationId(userId, userToCall);

      // Create CallHistory record immediately
      const callRecord = await CallHistory.create({
        callerId: new mongoose.Types.ObjectId(userId),
        receiverId: new mongoose.Types.ObjectId(userToCall),
        conversationId,
        type: typeCall,
        status: "pending",
        startedAt: new Date(),
      });

      const callRecordId = callRecord._id.toString();

      // Map temp callId to real DB record ID
      tempIdToDbId.set(callId, callRecordId);
      console.log(`[Call] initCall: MAPPED temp ${callId} -> ${callRecordId} (record created)`);

      // Bind this socket to the call (for potential later use)
      bindSocketToCall(socket.id, callRecordId);

      // Start timeout for unanswered calls
      const timeoutId = setTimeout(async () => {
        try {
          const updated = await CallHistory.findOneAndUpdate(
            { _id: callRecordId, status: "pending" },
            { status: "missed", endedAt: new Date() },
            { returnDocument: "after" }
          ).populate([
            { path: "callerId", select: "_id displayName avatar username" },
            { path: "receiverId", select: "_id displayName avatar username" },
          ]);

          if (updated) {
            const callLogMessage = await createCallLogMessage(updated);
            emitCallHistorySync(io, updated, userId);
            emitCallLogMessage(io, callLogMessage);
            io.to(userId).emit("callTimeout", { callId: callRecordId });
            io.to(userToCall).emit("callTimeout", { callId: callRecordId });
          }
        } catch (err) {
          console.error("[Call] initCall timeout error:", err);
        } finally {
          activeTimeouts.delete(callRecordId);
        }
      }, CALL_TIMEOUT_MS);

      activeTimeouts.set(callRecordId, timeoutId);

    } catch (err) {
      console.error("[Call] initCall error:", err);
    }
  });

  // [callUser]
  socket.on("callUser", async ({ userToCall, signalData, from, name, mediaStatus, typeCall, avatar, callId }) => {
    console.log(`[Call] callUser: ${userId} -> ${userToCall} (${typeCall}), clientCallId: ${callId}`);
    
    if (!callId) {
      console.warn(`[Call] callUser received WITHOUT callId! This is a problem.`);
    }

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

      // Check if call record already created by initCall
      let callRecordId = null;
      if (callId && callId.startsWith("temp_")) {
        callRecordId = tempIdToDbId.get(callId);
        if (callRecordId) {
          console.log(`[Call] callUser: reusing existing record ${callRecordId} from initCall`);
        }
      }

      // Only create new record if it doesn't exist yet
      if (!callRecordId) {
        console.log(`[Call] callUser: creating NEW CallHistory record (no initCall record found)`);
        
        const callRecord = await CallHistory.create({
          callerId: new mongoose.Types.ObjectId(authenticatedCallerId),
          receiverId: new mongoose.Types.ObjectId(userToCall),
          conversationId,
          type: typeCall,
          status: "pending",
          startedAt: new Date(),
        });

        callRecordId = callRecord._id.toString();
        console.log(`[Call] callUser: created record ${callRecordId}`);
        
        // Map if this is a temp ID (only if NOT already mapped)
        if (callId && callId.startsWith("temp_") && !tempIdToDbId.has(callId)) {
          tempIdToDbId.set(callId, callRecordId);
          console.log(`[Call] callUser: NEW mapping temp ${callId} -> ${callRecordId}`);
        }
      }

      bindSocketToCall(socket.id, callRecordId);
      console.log(`[Call] callUser: about to emit outgoingCallCreated with callId=${callRecordId}`);

      io.to(authenticatedCallerId).emit("outgoingCallCreated", {
        callId: callRecordId,
        userToCall,
        conversationId,
        type: typeCall,
      });

      // Gửi signal đến receiver nếu online
      const room = io.sockets.adapter.rooms.get(userToCall);
      if (room && room.size > 0) {
        // Fetch callerInfo trước để dùng cho cả glare và normal flow
        const callerInfo = await User.findById(authenticatedCallerId)
          .select("_id displayName avatar username")
          .lean();

        // ==========================================
        // CALL GLARE DETECTION
        // Kiểm tra xem receiver có đang gọi ngược lại cho mình không
        // ==========================================
        const reverseCall = await CallHistory.findOne({
          callerId: new mongoose.Types.ObjectId(userToCall),
          receiverId: new mongoose.Types.ObjectId(authenticatedCallerId),
          status: "pending",
          startedAt: { $gte: new Date(Date.now() - 30000) }
        }).lean();

        if (reverseCall) {
          console.log(`[Call] Call Glare DETECTED! A=${authenticatedCallerId}, B=${userToCall}, reverseCallId=${reverseCall._id}`);

          // Xác định Winner dựa trên socket ID (cùng logic với client)
          const mySocketId = from;
          // Tìm socket ID của receiver (userToCall)
          const reverseSockets = await io.in(userToCall).allSockets();
          const reverseSocketId = [...reverseSockets][0] || null;

          const iAmWinner = mySocketId > reverseSocketId;
          const winnerId = iAmWinner ? authenticatedCallerId : userToCall;
          const loserId = iAmWinner ? userToCall : authenticatedCallerId;

          console.log(`[Call] Glare result: Winner=${winnerId} (socket ${iAmWinner ? mySocketId : reverseSocketId}), Loser=${loserId}`);

          if (iAmWinner) {
            // Tôi là Winner → giữ cuộc gọi của mình, reject cuộc gọi ngược lại của B
            // Cancel timeout của reverse call để B không bị kẹt
            const reverseTimeout = activeTimeouts.get(reverseCall._id.toString());
            if (reverseTimeout) {
              clearTimeout(reverseTimeout);
              activeTimeouts.delete(reverseCall._id.toString());
              console.log(`[Call] Cleared timeout of reverse call ${reverseCall._id}`);
            }

            // Cập nhật reverse call thành "missed" (bị glare thua)
            await CallHistory.findByIdAndUpdate(reverseCall._id, {
              status: "missed",
              endedAt: new Date(),
            });

            // Emit glare cho B (Loser): báo B rằng có glare và B phải accept cuộc gọi của A
            io.to(loserId).emit("glare", {
              winnerSocketId: mySocketId,
              winnerDbId: authenticatedCallerId,
              winnerName: callerInfo?.displayName || name,
              winnerAvatar: callerInfo?.avatar || avatar || "",
              winnerMediaStatus: mediaStatus,
              winnerCallId: callRecordId,
              winnerSignal: signalData,
              myCallId: reverseCall._id.toString(),
              typeCall,
            });
            console.log(`[Call] Emitted glare to loser ${loserId}`);

            // Emit outgoingCallCreated cho Winner (mình) như bình thường
            io.to(authenticatedCallerId).emit("outgoingCallCreated", {
              callId: callRecordId,
              userToCall,
              conversationId,
              type: typeCall,
            });
            // Winner tiếp tục chờ B accept (qua glare event B sẽ auto-answer)

          } else {
            // Tôi là Loser → hủy cuộc gọi của mình, chấp nhận glare signal từ Winner
            // Cancel timeout của cuộc gọi này (của mình)
            const myTimeout = activeTimeouts.get(callRecordId);
            if (myTimeout) {
              clearTimeout(myTimeout);
              activeTimeouts.delete(callRecordId);
              console.log(`[Call] Cleared my (loser) timeout for ${callRecordId}`);
            }

            // Cập nhật cuộc gọi của tôi thành "missed"
            await CallHistory.findByIdAndUpdate(callRecordId, {
              status: "missed",
              endedAt: new Date(),
            });

            // Emit glareLost cho Loser (mình): báo mình phải accept cuộc gọi từ Winner
            io.to(authenticatedCallerId).emit("glareLost", {
              winnerDbId: winnerId,
              winnerSignal: signalData,
              myCallId: callRecordId,
              typeCall,
            });
            console.log(`[Call] Emitted glareLost to loser (myself) ${authenticatedCallerId}`);
            // ĐỪNG emit outgoingCallCreated - loser không có outgoing call
          }

          return; // Kết thúc xử lý callUser — glare đã được xử lý
        }

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
        console.log(`[Call] Receiver ${userToCall} is offline. Ringing for 45s...`);
      }

      // Server-side timeout: 45s -> "missed"
      const timeoutId = setTimeout(async () => {
        try {
          const updatedCall = await CallHistory.findOneAndUpdate(
            { _id: callRecordId, status: "pending" },
            { status: "missed", endedAt: new Date() },
            { returnDocument: "after" }
          ).populate([
            { path: "callerId", select: "_id displayName avatar username" },
            { path: "receiverId", select: "_id displayName avatar username" },
          ]);

          if (updatedCall) {
            const callLogMessage = await createCallLogMessage(updatedCall);
            emitCallHistorySync(io, updatedCall, authenticatedCallerId);
            emitCallLogMessage(io, callLogMessage);

            io.to(authenticatedCallerId).emit("callTimeout", { callId: callRecordId });
            io.to(userToCall).emit("callTimeout", { callId: callRecordId });
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
    bindSocketToCall(socket.id, callId);
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
    unbindSocketFromCall(socket.id);
    
    // Resolve real callId if it's a client temp callId
    let actualCallId = callId;
    if (callId && callId.startsWith("temp_")) {
      actualCallId = tempIdToDbId.get(callId);
      if (actualCallId) {
        console.log(`[Call] endCall: Resolved temp callId ${callId} -> ${actualCallId}`);
        tempIdToDbId.delete(callId);
      } else {
        console.log(`[Call] endCall: No mapping found for temp callId ${callId}, trying search`);
        actualCallId = null;
      }
    }
    
    console.log(`[Call] endCall: ${userId} -> ${to}, callId: ${callId}, actualCallId: ${actualCallId}`);

    // FALLBACK: Search for connected call if actualCallId is invalid
    if (!actualCallId || actualCallId.startsWith("temp_")) {
      console.log(`[Call] endCall: Invalid actualCallId "${actualCallId}", attempting fallback search...`);
      actualCallId = null;

      try {
        const userIdObj = new mongoose.Types.ObjectId(userId);
        const toIdObj = new mongoose.Types.ObjectId(to);
        const sixtySecondsAgo = new Date(Date.now() - 60000);
        
        console.log(`[Call] endCall fallback search: userId=${userId}, to=${to}`);
        
        const connectedCall = await CallHistory.findOne({
          $or: [
            { callerId: userIdObj, receiverId: toIdObj },
            { callerId: toIdObj, receiverId: userIdObj }
          ],
          status: { $in: ["pending", "ringing"] },
          startedAt: { $gte: sixtySecondsAgo }
        }).lean();
        
        if (connectedCall) {
          actualCallId = connectedCall._id.toString();
          console.log(`[Call] endCall fallback found: ${actualCallId}`);
        } else {
          console.log(`[Call] endCall fallback: NO connected call found`);
        }
      } catch (err) {
        console.error("[Call] endCall fallback search error:", err);
      }
    }

    // If still no valid actualCallId, abort
    if (!actualCallId || actualCallId.startsWith("temp_")) {
      console.log(`[Call] endCall: Cannot find valid callId, aborting. actualCallId="${actualCallId}"`);
      return;
    }

    try {
      // Luôn populated callRecord để có đủ thông tin cho emitCallEndedToParticipants
      const call = await CallHistory.findById(actualCallId).populate([
        { path: "callerId", select: "_id displayName avatar username" },
        { path: "receiverId", select: "_id displayName avatar username" },
      ]);
      
      if (!call) {
        console.log(`[Call] endCall: CallHistory not found for ${actualCallId}`);
        return;
      }

      // Đã kết thúc rồi -> ignore nhưng vẫn emit callEnded để chắc chắn
      if (call.endedBy) {
        console.log(`[Call] endCall idempotent: call ${actualCallId} already ended by ${call.endedBy}`);
        emitCallEndedToParticipants(io, call, actualCallId);
        return;
      }

      // Cancel timeout nếu còn
      const timeoutId = activeTimeouts.get(actualCallId);
      if (timeoutId) {
        clearTimeout(timeoutId);
        activeTimeouts.delete(timeoutId);
      }

      const now = new Date();
      let duration = null;
      if (call.answeredAt) {
        duration = Math.round((now - call.answeredAt) / 1000);
      }

      const updated = await CallHistory.findByIdAndUpdate(
        actualCallId,
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

      if (updated) {
        console.log(`[Call] endCall updated: ${actualCallId} status="completed" (duration=${duration}s)`);
        const callLogMessage = await createCallLogMessage(updated);
        emitCallHistorySync(io, updated, userId);
        emitCallLogMessage(io, callLogMessage);
        emitCallEndedToParticipants(io, updated, actualCallId);
      }

    } catch (err) {
      console.error("[CallHandler] endCall error:", err);
      
      // EMERGENCY FALLBACK: If CastError, do aggressive search
      if (err.name === "CastError" && !actualCallId) {
        console.log("[Call] endCall CastError detected, triggering emergency fallback...");
        try {
          const userIdObj = new mongoose.Types.ObjectId(userId);
          const toIdObj = new mongoose.Types.ObjectId(to);
          const twoMinutesAgo = new Date(Date.now() - 120000);
          
          const connectedCall = await CallHistory.findOne({
            $or: [
              { callerId: userIdObj, receiverId: toIdObj },
              { callerId: toIdObj, receiverId: userIdObj }
            ],
            status: { $in: ["pending", "connecting", "connected"] },
            startedAt: { $gte: twoMinutesAgo }
          }).lean();
          
          if (connectedCall) {
            console.log(`[Call] endCall emergency fallback found: ${connectedCall._id}`);
            
            const now = new Date();
            let duration = null;
            if (connectedCall.answeredAt) {
              duration = Math.round((now - connectedCall.answeredAt) / 1000);
            }
            
            const updated = await CallHistory.findByIdAndUpdate(
              connectedCall._id,
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
            
            if (updated) {
              console.log(`[Call] endCall emergency update: ${connectedCall._id} status="completed"`);
              const callLogMessage = await createCallLogMessage(updated);
              emitCallHistorySync(io, updated, userId);
              emitCallLogMessage(io, callLogMessage);
              emitCallEndedToParticipants(io, updated, connectedCall._id);
            }
          }
        } catch (emergencyErr) {
          console.error("[CallHandler] endCall emergency fallback error:", emergencyErr);
        }
      }
    }
  });

  // [rejectCall] 
  socket.on("rejectCall", async ({ to, callId, reason }) => {
    unbindSocketFromCall(socket.id);
    
    // Resolve real callId if it's a client temp callId
    let actualCallId = callId;
    if (callId && callId.startsWith("temp_")) {
      actualCallId = tempIdToDbId.get(callId);
      if (actualCallId) {
        console.log(`[Call] Resolved temp callId ${callId} -> ${actualCallId}`);
        tempIdToDbId.delete(callId);
      } else {
        console.log(`[Call] No mapping found for temp callId ${callId}, will try search`);
        actualCallId = null; // Force search fallback
      }
    }
    
    console.log(`[Call] rejectCall: ${userId} -> ${to}, callId: ${callId}, actualCallId: ${actualCallId}, reason: ${reason}`);

    // FALLBACK: Search for pending call if actualCallId is invalid
    if (!actualCallId || actualCallId.startsWith("temp_")) {
      console.log(`[Call] Invalid actualCallId "${actualCallId}", attempting fallback search...`);
      actualCallId = null;
      
      try {
        const userIdObj = new mongoose.Types.ObjectId(userId);
        const toIdObj = new mongoose.Types.ObjectId(to);
        const sixtySecondsAgo = new Date(Date.now() - 60000);
        
        console.log(`[Call] Fallback search: userId=${userId}, to=${to}, after=${sixtySecondsAgo}`);

        // Chỉ tìm call mà người gọi là người reject (userId là caller, to là receiver)
        // KHÔNG dùng $or để tránh match nhầm vào call ngược chiều khi xảy ra Call Glare
        const pendingCall = await CallHistory.findOne({
          callerId: userIdObj,
          receiverId: toIdObj,
          status: "pending",
          startedAt: { $gte: sixtySecondsAgo }
        }).lean();
        
        if (pendingCall) {
          actualCallId = pendingCall._id.toString();
          console.log(`[Call] Fallback found pending call: ${actualCallId}`);
        } else {
          console.log(`[Call] Fallback search found NO pending call`);
        }
      } catch (searchErr) {
        console.error("[Call] Fallback search error:", searchErr);
      }
    }

    // If still no valid actualCallId, abort
    if (!actualCallId || actualCallId.startsWith("temp_")) {
      console.log(`[Call] rejectCall: Cannot find valid callId, aborting. actualCallId="${actualCallId}"`);
      return;
    }

    const timeoutId = activeTimeouts.get(actualCallId);
    if (timeoutId) {
      clearTimeout(timeoutId);
      activeTimeouts.delete(timeoutId);
    }

    try {
      // Fetch call record to determine proper status
      const call = await CallHistory.findById(actualCallId);
      if (!call) {
        console.log(`[Call] rejectCall: CallHistory not found for ${actualCallId}`);
        return;
      }

      // Determine status based on reason and whether call was answered
      let status = "rejected";
      if (reason === "busy") {
        status = "busy";
      } else if (reason === "cancelled") {
        // Caller cancelled before answer → for receiver, it's "missed"
        status = "missed";
      } else if (call.answeredAt) {
        // Call was answered, then rejected/ended → "completed"
        status = "completed";
      }

      const updated = await CallHistory.findByIdAndUpdate(
        actualCallId,
        { status, endedAt: new Date(), endedBy: new mongoose.Types.ObjectId(userId) },
        { returnDocument: 'after' }
      ).populate([
        { path: "callerId", select: "_id displayName avatar username" },
        { path: "receiverId", select: "_id displayName avatar username" },
      ]);

      if (updated) {
        console.log(`[Call] Updated call ${actualCallId} status to "${status}"`);
        const callLogMessage = await createCallLogMessage(updated);
        emitCallHistorySync(io, updated, userId);
        emitCallLogMessage(io, callLogMessage);

        if (reason === "cancelled") {
          // Caller hủy → chỉ báo cho receiver (callee) biết để đóng notification
          // KHÔNG emit callEnded cho caller vì caller có thể đang trong glare (winner vẫn cần nhận offer)
          const receiverId = updated.receiverId?._id?.toString() || updated.receiverId?.toString();
          if (receiverId) {
            io.to(receiverId).emit("callEnded");
            console.log(`[Call] Emitted callEnded only to receiver (cancelled): ${receiverId}`);
          }
        } else {
          emitCallEndedToParticipants(io, updated, actualCallId);
        }
      }

      // Chỉ emit callRejected nếu không phải là "cancelled"
      // Với "cancelled", chỉ cần callEnded để đóng notification im lặng
      if (reason !== "cancelled") {
        io.to(to).emit("callRejected", { reason: reason || "User busy" });
      } else {
        // A cancelled → B cần nhận event để tự đóng CallNotification
        io.to(to).emit("callCancelled", { callId: actualCallId, reason: "cancelled" });
      }
    } catch (err) {
      console.error("[CallHandler] rejectCall error:", err);

      // EMERGENCY FALLBACK: If CastError (invalid ObjectId), do aggressive search
      // Also catch when actualCallId is an unresolvable temp ID (string "temp_...")
      const needsFallback =
        err.name === "CastError" ||
        (actualCallId && actualCallId.startsWith("temp_"));

      if (needsFallback) {
        console.log("[Call] CastError detected, triggering emergency fallback search...");
        try {
          const userIdObj = new mongoose.Types.ObjectId(userId);
          const toIdObj = new mongoose.Types.ObjectId(to);
          const twoMinutesAgo = new Date(Date.now() - 120000);
          
          // Same strict constraint: only find call where userId is the caller (not receiver)
          const pendingCall = await CallHistory.findOne({
            callerId: userIdObj,
            receiverId: toIdObj,
            status: "pending",
            startedAt: { $gte: twoMinutesAgo }
          }).lean();
          
          if (pendingCall) {
            console.log(`[Call] Emergency fallback found call: ${pendingCall._id}`);
            
            // Determine status
            let status = "rejected";
            if (reason === "busy") {
              status = "busy";
            } else if (reason === "cancelled") {
              status = "missed";
            }
            
            const updated = await CallHistory.findByIdAndUpdate(
              pendingCall._id,
              { status, endedAt: new Date(), endedBy: new mongoose.Types.ObjectId(userId) },
              { returnDocument: 'after' }
            ).populate([
              { path: "callerId", select: "_id displayName avatar username" },
              { path: "receiverId", select: "_id displayName avatar username" },
            ]);
            
            if (updated) {
              console.log(`[Call] Emergency update: call ${pendingCall._id} status to "${status}"`);
              const callLogMessage = await createCallLogMessage(updated);
              emitCallHistorySync(io, updated, userId);
              emitCallLogMessage(io, callLogMessage);
              emitCallEndedToParticipants(io, updated, pendingCall._id);
              
              if (reason !== "cancelled") {
                io.to(to).emit("callRejected", { reason: reason || "User busy" });
              } else {
                io.to(to).emit("callCancelled", { callId: pendingCall._id.toString(), reason: "cancelled" });
              }
            }
          }
        } catch (emergencyErr) {
          console.error("[CallHandler] Emergency fallback error:", emergencyErr);
        }
      }
    }
  });

  // [toggleMedia]
  socket.on("toggleMedia", ({ to, cam, mic }) => {
    io.to(to).emit("updateMediaStatus", { cam, mic });
  });

  // [disconnect]
  // KHÔNG cancel timeout ở đây - call vẫn có thể tiếp tục từ thiết bị khác
  // (multi-device: user có thể có nhiều socket cùng lúc)
  socket.on("disconnect", () => {
    console.log(`[CallHandler] Socket disconnect: ${socket.id} (user: ${userId})`);
    finalizeCallFromDisconnect({ socketId: socket.id, userId, io });
  });
};

// Init 
// Run cleanup ngay khi module load (khắc phục pending records từ lần chạy trước)
runCleanup();

// Auto-cleanup mỗi 60 giây
setInterval(runCleanup, 60_000);

module.exports = { registerCallHandlers };