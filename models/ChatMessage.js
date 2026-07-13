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
    // NGO Case Workspace scope — set instead of/alongside engagementId when
    // this message belongs to an NGO application's inquiry or case chat.
    applicationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'NgoApplication',
        default: null,
        index: true
    },
    // Only meaningful when applicationId is set. 'inquiry' = the temporary
    // screening-phase thread (locked the moment the application leaves the
    // 'inquiry' status). 'case' = the permanent thread that starts once the
    // application is accepted. Kept as a separate discriminator (rather than
    // inferring phase from the application's current status at read time)
    // so inquiry-phase history stays readable and correctly labeled forever,
    // even after the application later moves to accepted/rejected.
    phase: {
        type: String,
        enum: ['', 'inquiry', 'case'],
        default: ''
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
