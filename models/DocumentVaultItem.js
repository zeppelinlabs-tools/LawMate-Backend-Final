const mongoose = require('mongoose');

/**
 * DocumentVaultItem
 *
 * The shared, bi-directional "Documents Room" between one specific client
 * and one specific professional (lawyer or social worker), scoped to a
 * single CaseEngagement. Distinct from models/Document.js, which is a
 * single-user document list with no concept of a shared pairing.
 *
 * uploadedBy records who added the file so the UI can show "You uploaded"
 * vs "They uploaded" without an extra lookup. Deletion is a hard delete
 * (the spec calls for permanent removal from both sides, not a soft/
 * per-user hide), so there is no separate visibility flag per party.
 */
const DocumentVaultItemSchema = new mongoose.Schema({
    engagementId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'CaseEngagement',
        required: true,
        index: true
    },
    uploadedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    fileName: {
        type: String,
        required: true
    },
    fileUrl: {
        type: String,
        required: true
    },
    fileType: {
        type: String,
        enum: ['image', 'video', 'document'],
        required: true
    },
    fileSizeBytes: {
        type: Number,
        default: 0
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('DocumentVaultItem', DocumentVaultItemSchema);
