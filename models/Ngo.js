const mongoose = require('mongoose');

// ── NGO Application ────────────────────────────────────────────────────────────
// Submitted by a client to request help from an NGO. Contains all the
// information the NGO needs to triage and decide whether to accept the case.
const NgoApplicationSchema = new mongoose.Schema({
    ngoId:                  { type: mongoose.Schema.Types.ObjectId, ref: 'Ngo', required: true },
    ngoUserId:              { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // the social_worker user who owns this NGO
    applicantId:            { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    applicantName:          { type: String, default: '' },
    applicantPhone:         { type: String, default: '' },
    applicantEmail:         { type: String, default: '' },
    applicantCnic:          { type: String, default: '' },
    applicantMonthlyIncome: { type: String, default: '' },
    issueType:              { type: String, default: '' },
    caseFocusCategory:      { type: String, default: '' },
    caseSummary:            { type: String, required: true },
    description:            { type: String, default: '' },
    attachedDocuments:      { type: [String], default: [] }, // file URLs
    referenceId:            { type: String, default: '' },
    status: {
        type:    String,
        enum:    ['pending', 'under_review', 'accepted', 'rejected'],
        default: 'pending'
    },
    rejectionReason:        { type: String, default: '' },
    // When accepted: a chat session ID so client and NGO can communicate
    chatSessionId:          { type: String, default: '' },
    notes:                  { type: String, default: '' }, // NGO internal notes
    createdAt:              { type: Date, default: Date.now },
    updatedAt:              { type: Date, default: Date.now }
});

// ── NGO Case Tracking ──────────────────────────────────────────────────────────
// After an application is accepted, a case tracking record is created.
// This documents the progress, milestones, and documents for the case.
const NgoCaseTrackingSchema = new mongoose.Schema({
    applicationId:  { type: mongoose.Schema.Types.ObjectId, ref: 'NgoApplication', required: true },
    ngoId:          { type: mongoose.Schema.Types.ObjectId, ref: 'Ngo', required: true },
    clientId:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    ngoUserId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title:          { type: String, default: '' },
    status: {
        type:    String,
        enum:    ['open', 'in_progress', 'pending_docs', 'hearing', 'resolved', 'closed'],
        default: 'open'
    },
    milestones: [{
        title:       { type: String, required: true },
        description: { type: String, default: '' },
        status:      { type: String, enum: ['pending', 'done'], default: 'pending' },
        date:        { type: Date, default: Date.now }
    }],
    documents: [{
        name:        { type: String, required: true },
        fileUrl:     { type: String, required: true },
        uploadedBy:  { type: String, default: '' }, // 'client' or 'ngo'
        uploadedAt:  { type: Date, default: Date.now }
    }],
    nextHearingDate: { type: Date, default: null },
    notes:           { type: String, default: '' },
    createdAt:       { type: Date, default: Date.now },
    updatedAt:       { type: Date, default: Date.now }
});

// ── NGO ────────────────────────────────────────────────────────────────────────
// An NGO record is automatically created when a social_worker registers with
// workType: 'organization'. The ownerId links it back to the User so the
// social worker can manage their NGO profile and incoming applications.
const NgoSchema = new mongoose.Schema({
    // Core identity
    name:                   { type: String, required: true },
    subtitle:               { type: String, default: '' },
    description:            { type: String, default: '' },
    founderOrLeader:        { type: String, default: '' },
    logoUrl:                { type: String, default: '' },

    // Contact
    city:                   { type: String, default: '' },
    address:                { type: String, default: '' },
    headOfficeAddress:      { type: String, default: '' },
    phone:                  { type: String, default: '' },
    helpline:               { type: String, default: '' },
    alternatePhone:         { type: String, default: '' },
    email:                  { type: String, default: '' },
    website:                { type: String, default: '' },

    // Registration & verification
    registrationNumber:     { type: String, default: '' },
    registrationCertUrl:    { type: String, default: '' }, // uploaded certificate URL
    govtRegistrationDocUrl: { type: String, default: '' }, // government doc URL
    verificationAuthority:  { type: String, default: '' }, // e.g. "SECP", "Punjab Social Welfare Dept"

    // Coverage & categories
    focusAreas:             { type: [String], default: [] },
    categories:             { type: [String], default: [] },
    supportedCities:        { type: [String], default: [] },
    requiredDocuments:      { type: [String], default: [] }, // docs client must submit

    // Status
    isVerified:             { type: Boolean, default: false },
    isActive:               { type: Boolean, default: true },
    ownerId:                { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    // Stats (updated dynamically)
    totalApplications:      { type: Number, default: 0 },
    acceptedCases:          { type: Number, default: 0 },

    createdAt:              { type: Date, default: Date.now }
});

const Ngo             = mongoose.model('Ngo',             NgoSchema);
const NgoApplication  = mongoose.model('NgoApplication',  NgoApplicationSchema);
const NgoCaseTracking = mongoose.model('NgoCaseTracking', NgoCaseTrackingSchema);

module.exports = { Ngo, NgoApplication, NgoCaseTracking };
