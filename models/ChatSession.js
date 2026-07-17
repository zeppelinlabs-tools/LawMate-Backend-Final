/**
 * ChatSession Model
 * Saves full AI chat sessions to MongoDB per user.
 * Each session has a title + array of messages (user + AI replies).
 */
const mongoose = require('mongoose');

const ChatMessageSchema = new mongoose.Schema({
    role:          { type: String, enum: ['user', 'assistant'], required: true },
    text:          { type: String, default: '' },
    attachmentType:{ type: String, default: null }, // 'image' | 'document' | 'audio' | null
    attachmentName:{ type: String, default: null },
    // The actual hosted URL for the attachment, set when a real file is
    // uploaded with the message. Previously this didn't exist at all —
    // only the type/name LABELS were ever saved, never the file itself,
    // so a message's image only ever existed as a local path on the
    // sender's device. Reloading that message later (e.g. from "Recent
    // Chats") had nothing real to display, which is what caused
    // chat_history rendering to crash on attachmentPath being null.
    fileUrl:       { type: String, default: null },
    timestamp:     { type: Date, default: Date.now }
}, { _id: true });

const ChatSessionSchema = new mongoose.Schema({
    userId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title:       { type: String, default: 'New Conversation' },
    messages:    { type: [ChatMessageSchema], default: [] },
    lastUpdated: { type: Date, default: Date.now },
    createdAt:   { type: Date, default: Date.now }
});

// Auto-update lastUpdated on save
ChatSessionSchema.pre('save', function() {
    this.lastUpdated = Date.now();
});

module.exports = mongoose.model('ChatSession', ChatSessionSchema);
