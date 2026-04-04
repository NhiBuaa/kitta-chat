const mongoose = require('mongoose');

const groupSchema = new mongoose.Schema({
    name: { type: String, required: true },
    admin: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    avatar: { type: String, default: "" },
}, { timestamps: true });

// Index cho truy vấn "user nằm trong nhóm nào"
// Used in presenceHandler và syncMissedMessages
groupSchema.index({ members: 1 });

const Group = mongoose.model('Group', groupSchema);

module.exports = Group;