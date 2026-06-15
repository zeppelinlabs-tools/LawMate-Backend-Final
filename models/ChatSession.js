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
ChatSessionSchema.pre('save', function(next) {
    this.lastUpdated = Date.now();
    if (typeof next === 'function') next();
});

module.exports = mongoose.model('ChatSession', ChatSessionSchema);
