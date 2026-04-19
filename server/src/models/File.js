const mongoose = require('mongoose');

const fileSchema = new mongoose.Schema({
    ownerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    originalName: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    s3Key: { type: String, required: true },
    url: { type: String, required: true },
    fileHash: { type: String }
}, { timestamps: true });

module.exports = mongoose.model('File', fileSchema);

fileSchema.index({ ownerId: 1, createdAt: -1 });