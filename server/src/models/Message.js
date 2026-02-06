const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    conversationId: { type: String, required: true },

    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    receiver: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    text: { type: String, default: "" },

    image: { type: String, default: "" },
    isRead: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('Message', messageSchema);