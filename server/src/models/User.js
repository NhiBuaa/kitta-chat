const mongoose = require("mongoose");

const DEFAULT_AVATAR = process.env.DEFAULT_AVATAR;

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    isOnline: { type: Boolean, default: false },
    displayName: { type: String, default: "" },
    avatar: { type: String, default: DEFAULT_AVATAR },
    provider: {
      type: String,
      enum: ["local", "google"],
      default: "local",
    },
    status: {
      type: String,
      default: "Chào bạn, tôi đang dùng KittaChat.",
    },
    activityStatus: {
      state: {
        type: String,
        enum: ["active", "offline", "busy"],
        default: "active",
      },
      lastSeen: {
        type: Date,
        default: Date.now,
      },
    },
    friends: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    friendRequests: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    // sentRequests: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
  },
  { timestamps: true },
);

// Index cho truy vấn bạn bè (friend list, online friends)
// Array field index - chậm hơn compound index nhưng cần thiết
userSchema.index({ friends: 1 });

// Index cho truy vấn lời mời kết bạn
userSchema.index({ friendRequests: 1 });

// Index cho tìm kiếm theo displayName (nếu cần search users)
userSchema.index({ displayName: 1 });

module.exports = mongoose.model("User", userSchema);
