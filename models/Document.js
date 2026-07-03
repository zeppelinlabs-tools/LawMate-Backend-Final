const mongoose = require('mongoose');

const DocumentSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    // Document type — matches the docType keys from the frontend
    // (nikkahnama, rental_agreement, affidavit, business_contract, etc.)
    docType: {
        type: String,
        default: 'generated'
    },
    title: {
        type: String,
        required: true
    },
    fileName: {
        type: String,
        required: true
    },
    filePath: {
        type: String,
        required: true
    },
    fileUrl: {
        type: String,
        default: ''
    },
    // Raw form fields saved as JSON so the document can be re-rendered
    // or audited without needing the original .txt content blob
    formFields: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    // Base64 PNG of the digital signature drawn by the user
    signatureData: {
        type: String,
        default: null
    },
    // Whether the user has digitally signed this document
    isSigned: {
        type: Boolean,
        default: false
    },
    signedAt: {
        type: Date,
        default: null
    },
    // Document status: draft | signed | archived
    status: {
        type: String,
        enum: ['draft', 'signed', 'archived'],
        default: 'draft'
    },
    // Reference number like DOC_1782322430084 shown on the stamp
    referenceNumber: {
        type: String,
        default: ''
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Auto-generate a reference number before saving if not set
DocumentSchema.pre('save', function(next) {
    if (!this.referenceNumber) {
        this.referenceNumber = `DOC_${Date.now()}`;
    }
    next();
});

module.exports = mongoose.model('Document', DocumentSchema);
