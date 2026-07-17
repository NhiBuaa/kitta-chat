const mongoose = require('mongoose');

const groupSchema = new mongoose.Schema({
    name: { type: String, required: true },
    admin: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    avatar: { type: String, default: "" },
}, { timestamps: true });

const Group = mongoose.models.Group || mongoose.model('Group', groupSchema);

module.exports = Group;

groupSchema.index({ members: 1 });