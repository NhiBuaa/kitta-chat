require("dotenv").config({ path: __dirname + "/../.env" });
const mongoose = require("mongoose");
const User = require("../src/models/User");
const Conversation = require("../src/models/Conversation");
const ConversationParticipant = require("../src/models/ConversationParticipant");
const Message = require("../src/models/Message");

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/shot-chat";
const TARGET_USER_ID = "6a560ba256273d30a61a405c";
const TARGET_EMAIL = "supe2109@gmail.com";

async function seed50Friends() {
  console.log(`Connecting to MongoDB at: ${MONGO_URI}...`);
  await mongoose.connect(MONGO_URI);

  console.log("Connected to MongoDB successfully!");

  let targetUser = await User.findById(TARGET_USER_ID);
  if (!targetUser) {
    targetUser = await User.findOne({ email: TARGET_EMAIL });
  }

  if (!targetUser) {
    console.log(`Creating target user NhiBuaa (${TARGET_USER_ID})...`);
    targetUser = await User.create({
      _id: new mongoose.Types.ObjectId(TARGET_USER_ID),
      email: TARGET_EMAIL,
      password: "$2b$10$I/0i6k1XnxJFFSfoTufJw.xmkHcL3Es6WFSt5JufxV/hwiP8T0DVq",
      displayName: "NhiBuaa",
      avatar: "https://fullstack-final-nhibuaa.s3.ap-southeast-1.amazonaws.com/avatars/1784030113180-182084650-blob.webp",
      provider: "local",
      status: "Chào bạn, tôi đang dùng KittaChat.",
      activityStatus: {
        state: "active",
        lastSeen: new Date(),
      },
      friends: [],
      friendRequests: [],
    });
  }

  console.log(`Target User: ${targetUser.displayName} (${targetUser._id})`);

  const now = Date.now();
  const createdFriends = [];

  for (let i = 1; i <= 50; i++) {
    const friendEmail = `testfriend${i}@example.com`;
    const friendDisplayName = `Test Friend ${i.toString().padStart(2, "0")}`;
    
    let friendUser = await User.findOne({ email: friendEmail });
    if (!friendUser) {
      friendUser = await User.create({
        email: friendEmail,
        password: "$2b$10$I/0i6k1XnxJFFSfoTufJw.xmkHcL3Es6WFSt5JufxV/hwiP8T0DVq",
        displayName: friendDisplayName,
        avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=Friend${i}`,
        provider: "local",
        status: `Tôi là ${friendDisplayName}`,
        activityStatus: {
          state: i % 3 === 0 ? "active" : "offline",
          lastSeen: new Date(now - i * 60000),
        },
        friends: [targetUser._id],
        friendRequests: [],
      });
    } else {
      if (!friendUser.friends.map(id => id.toString()).includes(targetUser._id.toString())) {
        friendUser.friends.push(targetUser._id);
        await friendUser.save();
      }
    }

    createdFriends.push(friendUser);

    // 1. Legacy Conversation ID & Direct Key
    const sortedIds = [targetUser._id.toString(), friendUser._id.toString()].sort();
    const legacyConversationId = sortedIds.join("_");
    const directKey = legacyConversationId;

    // 2. Tạo hoặc tìm Message thử nghiệm (mỗi bạn 1 message cách nhau 2 phút để phân trang cursor chuẩn)
    const msgCreatedAt = new Date(now - i * 2 * 60 * 1000);
    let message = await Message.findOne({ conversationId: legacyConversationId });
    if (!message) {
      message = await Message.create({
        sender: friendUser._id,
        receiver: targetUser._id,
        conversationId: legacyConversationId,
        text: `Xin chào ${targetUser.displayName}! Đây là tin nhắn thử nghiệm từ ${friendDisplayName} (#${i})`,
        createdAt: msgCreatedAt,
        updatedAt: msgCreatedAt,
      });
    }

    // 3. Tạo hoặc update Conversation read model
    let conversation = await Conversation.findOne({ legacyConversationId });
    if (!conversation) {
      conversation = await Conversation.create({
        kind: "direct",
        legacyConversationId,
        directKey,
        participantUserIds: [targetUser._id, friendUser._id],
        lastMessageId: message._id,
        lastMessageAt: msgCreatedAt,
      });
    } else {
      conversation.lastMessageId = message._id;
      conversation.lastMessageAt = msgCreatedAt;
      await conversation.save();
    }

    // 4. Tạo hoặc update ConversationParticipant cho targetUser (NhiBuaa)
    let participantTarget = await ConversationParticipant.findOne({
      conversationId: conversation._id,
      userId: targetUser._id,
    });

    if (!participantTarget) {
      await ConversationParticipant.create({
        conversationId: conversation._id,
        legacyConversationId,
        userId: targetUser._id,
        joinedAt: new Date(now - 30 * 24 * 60 * 60 * 1000),
        state: {
          pinnedAt: i <= 2 ? new Date(now - i * 1000) : null, // Pin 2 cuộc trò chuyện đầu tiên
          unreadCount: i % 4 === 0 ? 1 : 0,
          lastMessageId: message._id,
          lastMessageAt: msgCreatedAt,
        },
      });
    } else {
      participantTarget.state.lastMessageId = message._id;
      participantTarget.state.lastMessageAt = msgCreatedAt;
      await participantTarget.save();
    }

    // 5. Tạo hoặc update ConversationParticipant cho Friend
    let participantFriend = await ConversationParticipant.findOne({
      conversationId: conversation._id,
      userId: friendUser._id,
    });

    if (!participantFriend) {
      await ConversationParticipant.create({
        conversationId: conversation._id,
        legacyConversationId,
        userId: friendUser._id,
        joinedAt: new Date(now - 30 * 24 * 60 * 60 * 1000),
        state: {
          lastMessageId: message._id,
          lastMessageAt: msgCreatedAt,
        },
      });
    }
  }

  // Cập nhật mảng friends cho targetUser (NhiBuaa)
  const existingFriendIds = new Set(targetUser.friends.map(id => id.toString()));
  createdFriends.forEach(f => existingFriendIds.add(f._id.toString()));
  targetUser.friends = Array.from(existingFriendIds).map(id => new mongoose.Types.ObjectId(id));
  await targetUser.save();

  console.log(`🎉 Đã khởi tạo thành công 50 bạn bè và 50 cuộc trò chuyện Sidebar cho người dùng ${targetUser.displayName} (${targetUser._id})!`);
  console.log(`Số lượng friends hiện tại trong DB của ${targetUser.displayName}: ${targetUser.friends.length}`);

  await mongoose.disconnect();
}

seed50Friends().catch((err) => {
  console.error("Lỗi khi seed dữ liệu:", err);
  mongoose.disconnect();
  process.exit(1);
});
