const User = require("../../models/User");
const Group = require("../../models/Group");
const Message = require("../../models/Message");
const getSafeUserName = require("../../utils/getSafeUserName");
const saveMessageInBackground = require("../../utils/saveMessageInBackground");
const buildConversationId = require("../../utils/buildConversationId");
const { getCachedUserProfile } = require("../../services/cacheService");
const { buildMessageCreatedJob } = require("../../queues/auditJobs");
const { auditQueue: defaultAuditQueue } = require("../../queues/auditQueue");
const { SOCKET_EVENTS, SERVER_SIDE_EVENTS } = require("../socketEvents");
const {
  emitServerSide,
  emitToConversation,
  emitToUser,
} = require("../realtimePublisher");

const NODE_NAME = process.env.NODE_NAME || process.env.HOSTNAME || "backend";
const logPrefix = `[Message][node=${NODE_NAME}]`;

const createRegisterMessageHandlers = ({
  saveMessage = saveMessageInBackground,
  getCachedUserProfile: loadCachedUserProfile = getCachedUserProfile,
  auditQueue = defaultAuditQueue,
  GroupModel = Group,
  UserModel = User,
  MessageModel = Message,
  logger = console,
} = {}) => (socket, io) => {
  socket.on(SOCKET_EVENTS.MESSAGE_SEND, async (messageData, callBack) => {
    try {
      const receiverId = messageData.receiverId || messageData.receiver;
      const sender = messageData.sender;
      const isGroup = messageData.isGroup;
      const senderId = typeof sender === "object" ? sender._id : sender;

      if (!receiverId) {
        logger.error(`${logPrefix} sendMessage rejected reason=missing-receiverId`, messageData);
        callBack?.({ success: false });
        return;
      }

      const cachedProfile = await loadCachedUserProfile(senderId, UserModel);
      const senderInfo = {
        _id: senderId,
        displayName: getSafeUserName(cachedProfile),
        avatar: cachedProfile?.avatar,
      };

      const conversationId =
        messageData.conversationId ||
        (isGroup ? receiverId : buildConversationId(senderId, receiverId));

      logger.log(
        `${logPrefix} sendMessage start sender=${senderId} receiver=${receiverId} conv=${conversationId} isGroup=${Boolean(isGroup)} socket=${socket.id}`,
      );

      const { doc: savedMessage, isDuplicate } = await saveMessage({
        ...messageData,
        sender: senderInfo,
        conversationId,
        receiverId,
      });

      const payloadToEmit = {
        ...messageData,
        sender: senderInfo,
        receiver: messageData.receiver || receiverId,
        _id: savedMessage?._id || messageData._id,
        createdAt: savedMessage?.createdAt || messageData.createdAt || new Date(),
        attachments: savedMessage?.attachments || messageData.attachments || [],
        idempotencyKey: messageData.idempotencyKey || null,
      };

      if (isGroup) {
        if (!payloadToEmit.groupName) {
          const groupDoc = await GroupModel.findById(receiverId).select("name displayName");
          payloadToEmit.groupName = groupDoc?.displayName || groupDoc?.name || "Nhóm chat";
        }

        emitToConversation(io, receiverId, SOCKET_EVENTS.MESSAGE_RECEIVE, payloadToEmit);
        logger.log(`${logPrefix} emit group room=${receiverId} messageId=${payloadToEmit._id}`);
      } else {
        emitToUser(io, receiverId, SOCKET_EVENTS.MESSAGE_RECEIVE, payloadToEmit);
        emitToUser(io, senderId, SOCKET_EVENTS.MESSAGE_RECEIVE, payloadToEmit);
        logger.log(
          `${logPrefix} SENT sender=${senderId} receiver=${receiverId} messageId=${payloadToEmit._id} senderRoom=${senderId} receiverRoom=${receiverId}`,
        );

        emitServerSide(io, SERVER_SIDE_EVENTS.MESSAGE_DISPATCHED_PROOF, {
          messageId: payloadToEmit._id,
          senderId,
          receiverId,
          conversationId,
          originNode: NODE_NAME,
        });
      }

      if (savedMessage && !isDuplicate) {
        try {
          await auditQueue.publishMessageCreatedJob(
            buildMessageCreatedJob({
              message: savedMessage,
              isGroup,
              isDuplicate,
            }),
          );
        } catch (publishError) {
          logger.warn?.(`${logPrefix} message.created publish failed:`, publishError.message);
        }
      }

      logger.log(
        `${logPrefix} sendMessage done messageId=${savedMessage?._id || "n/a"} duplicate=${Boolean(isDuplicate)}`,
      );

      callBack?.({
        success: true,
        realId: savedMessage?._id,
        isDuplicate: Boolean(isDuplicate),
      });
    } catch (err) {
      logger.error(`${logPrefix} sendMessage error:`, err);
      callBack?.({ success: false });
    }
  });

  socket.on(SOCKET_EVENTS.MESSAGE_MARK_READ, async (data) => {
    try {
      if (data?.isGroup) {
        const { groupId, readerId } = data;
        if (!groupId || !readerId) return;

        await MessageModel.updateMany(
          {
            conversationId: groupId,
            readBy: { $ne: readerId },
          },
          { $addToSet: { readBy: readerId } },
        );

        emitToConversation(io, groupId, SOCKET_EVENTS.GROUP_MESSAGE_READ, { groupId, readerId });
        logger.log(`${logPrefix} markRead group group=${groupId} reader=${readerId}`);
      } else {
        const { senderId, receiverId } = data;
        if (!senderId || !receiverId) return;

        const convId = buildConversationId(senderId, receiverId);

        await MessageModel.updateMany(
          { sender: senderId, conversationId: convId, isRead: false },
          { $set: { isRead: true } },
        );

        emitToUser(io, senderId, SOCKET_EVENTS.MESSAGE_READ, { readerId: receiverId });
        logger.log(`${logPrefix} markRead direct conv=${convId} sender=${senderId} reader=${receiverId}`);
      }
    } catch (err) {
      logger.error(`${logPrefix} markRead error:`, err);
    }
  });
};

const registerMessageHandlers = createRegisterMessageHandlers();

module.exports = { createRegisterMessageHandlers, registerMessageHandlers };
