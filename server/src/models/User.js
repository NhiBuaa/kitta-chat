const mongoose = require('mongoose');

const DEFAULT_AVATAR = process.env.DEFAULT_AVATAR;

const userSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    isOnline: { type: Boolean, default: false },
    displayName: { type: String, default: '' },
    avatar: { type: String, default: DEFAULT_AVATAR },
    status: {
        type: String,
        default: 'Hey there! I am using Chat App.'
    },
    activityStatus: {
        state: {
            type: String,
            enum: ['active', 'offline', 'busy'],
            default: 'active'
        },
        lastSeen: {
            type: Date,
            default: Date.now
        }
    },
    friends: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    friendRequests: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    // sentRequests: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);