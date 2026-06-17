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
    engagementId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'CaseEngagement',
        default: null
    },
    message: {
        type: String,
        default: ''
    },
    attachmentUrl: {
        type: String,
        default: ''
    },
    attachmentType: {
        type: String,
        default: ''
    },
    attachmentName: {
        type: String,
        default: ''
    },
    isRead: {
        type: Boolean,
        default: false
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('ChatMessage', ChatMessageSchema);
