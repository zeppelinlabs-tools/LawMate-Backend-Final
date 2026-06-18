const mongoose = require('mongoose');

// ── Timeline Entry (hearing records) ──────────────────────────
const CaseTimelineEntrySchema = new mongoose.Schema({
    caseId:              { type: mongoose.Schema.Types.ObjectId, ref: 'LegalCase', required: true },
    nextHearingDate:     { type: Date },
    stageOfProceeding:   { type: String, default: '' },
    presidingJudge:      { type: String, default: '' },
    proceedingsRemarks:  { type: String, default: '' },
    officialOrders:      { type: String, default: '' },
    createdAt:           { type: Date, default: Date.now }
});

// ── Vault Document (attached files per case) ──────────────────
const VaultDocumentSchema = new mongoose.Schema({
    caseId:    { type: mongoose.Schema.Types.ObjectId, ref: 'LegalCase', required: true },
    title:     { type: String, required: true },
    fileUrl:   { type: String, default: '' },
    createdAt: { type: Date, default: Date.now }
});

// ── Legal Case ────────────────────────────────────────────────
const LegalCaseSchema = new mongoose.Schema({
    title:                   { type: String, required: true },
    courtName:               { type: String, default: '' },
    caseType:                { type: String, default: '' },
    caseNumber:              { type: String, default: '' },
    caseYear:                { type: String, default: '' },
    biometricTrackingNumber: { type: String, default: '' },
    status: {
        type: String,
        enum: ['Ongoing', 'Closed', 'Pending', 'Adjourned', 'Decided'],
        default: 'Ongoing'
    },
    lawyerId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    lawyerName:  { type: String, default: '' },
    clientId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    clientName:  { type: String, default: '' },
    sharedWithClients: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    isShared:    { type: Boolean, default: false },
    createdAt:   { type: Date, default: Date.now },
    updatedAt:   { type: Date, default: Date.now }
});

LegalCaseSchema.pre('save', function (next) {
    this.updatedAt = Date.now();
    if (typeof next === 'function') next();
});

const LegalCase         = mongoose.model('LegalCase', LegalCaseSchema);
const CaseTimelineEntry = mongoose.model('CaseTimelineEntry', CaseTimelineEntrySchema);
const VaultDocument     = mongoose.model('VaultDocument', VaultDocumentSchema);

module.exports = { LegalCase, CaseTimelineEntry, VaultDocument };
