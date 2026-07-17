const mongoose = require('mongoose');

// A single party's signature entry (bride, groom, witnesses, etc.)
// — stored as an array so any document type can have as many or as
// few required signatories as its legal structure demands.
const PartySignatureSchema = new mongoose.Schema({
    role:          { type: String, required: true },  // e.g. 'Groom', 'Witness 1'
    name:          { type: String, default: '' },
    cnic:          { type: String, default: '' },
    // 'digital' = drawn on canvas, 'manual' = left as blank line on paper
    signatureType: { type: String, enum: ['digital', 'manual'], default: 'manual' },
    signatureData: { type: String, default: null }, // base64 PNG if digital
    signedAt:      { type: Date, default: null },
}, { _id: false });

const DocumentSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    docType: { type: String, default: 'generated' },
    title:   { type: String, required: true },
    fileName: { type: String, required: true },
    filePath: { type: String, required: true },
    fileUrl:  { type: String, default: '' },

    // Raw form fields as JSON for re-rendering
    formFields: { type: mongoose.Schema.Types.Mixed, default: {} },

    // The document generator's own verification details — required
    // so the generated document can be traced back to who created it.
    generatorName:      { type: String, default: '' },
    generatorCnic:      { type: String, default: '' },
    generatorSignature: { type: String, default: null }, // base64 PNG

    // Per-party signatures (one entry per required signatory role)
    partySignatures: { type: [PartySignatureSchema], default: [] },

    // Overall signed status — true when the generator has signed
    isSigned:  { type: Boolean, default: false },
    signedAt:  { type: Date, default: null },

    // draft | signed | archived
    status: {
        type: String,
        enum: ['draft', 'signed', 'archived'],
        default: 'draft'
    },

    referenceNumber: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now }
});

DocumentSchema.pre('save', function() {
    if (!this.referenceNumber) {
        this.referenceNumber = `DOC_${Date.now()}`;
    }
});

module.exports = mongoose.model('Document', DocumentSchema);
