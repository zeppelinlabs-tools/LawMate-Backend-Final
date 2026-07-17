const mongoose = require('mongoose');

/**
 * DocumentVaultItem
 *
 * The shared, bi-directional "Documents Room" between the two parties on
 * a case. Originally scoped only to a CaseEngagement (lawyer/social-worker
 * <-> client). Now also scoped-able to an NgoApplication, so the NGO Case
 * Workspace's Shared Vault tab reuses this exact same real-time,
 * per-uploader-owned system instead of a second parallel implementation.
 * Distinct from models/Document.js, which is a single-user document list
 * with no concept of a shared pairing.
 *
 * Exactly one of engagementId / applicationId is set per item — which one
 * determines which case this file belongs to. See the pre-validate hook
 * below.
 *
 * uploadedBy records who added the file so the UI can show "You uploaded"
 * vs "They uploaded" without an extra lookup, and is also the source of
 * truth for delete authorization (only the uploader may delete their own
 * file). Deletion is a hard delete (the spec calls for permanent removal
 * from both sides, not a soft/per-user hide), so there is no separate
 * visibility flag per party.
 */
const DocumentVaultItemSchema = new mongoose.Schema({
    engagementId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'CaseEngagement',
        default: null,
        index: true
    },
    // NGO Case Workspace scope — set instead of engagementId when this
    // file belongs to an NGO legal-aid case rather than a lawyer/social
    // worker engagement.
    applicationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'NgoApplication',
        default: null,
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

// Modern Mongoose (7+) removed the old callback-style `next` parameter
// for schema hooks — a hook now either runs synchronously with no
// parameter (throwing to fail validation) or returns a Promise. The
// previous function(next) {...} form here was calling next() as if it
// were still a callback; on this Mongoose version it isn't one, so that
// call threw "next is not a function" internally on every single
// validation — which is the actual reason every vault upload was
// failing with a generic "Server error".
DocumentVaultItemSchema.pre('validate', function () {
    const hasEngagement  = !!this.engagementId;
    const hasApplication = !!this.applicationId;
    if (hasEngagement === hasApplication) {
        // Both set, or neither set — exactly one scope must be provided.
        throw new Error('DocumentVaultItem requires exactly one of engagementId or applicationId.');
    }
});

module.exports = mongoose.model('DocumentVaultItem', DocumentVaultItemSchema);
