const mongoose = require('mongoose');

const ChatMessageSchema = new mongoose.Schema({
    senderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    receiverId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    message: {
        type: String,
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});
engagementId: { type: mongoose.Schema.Types.ObjectId, ref: 'CaseEngagement', default: null },
attachmentUrl:  { type: String, default: '' },
attachmentType: { type: String, default: '' },
attachmentName: { type: String, default: '' },
isRead:         { type: Boolean, default: false },
module.exports = mongoose.model('ChatMessage', ChatMessageSchema);
