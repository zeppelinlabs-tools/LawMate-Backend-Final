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
    // Step 1 of the intake wizard — short title shown in list views,
    // distinct from caseSummary (the fuller narrative description).
    caseTitle:               { type: String, default: '' },
    caseSummary:            { type: String, required: true },
    description:            { type: String, default: '' },
    attachedDocuments:      { type: [String], default: [] }, // file URLs

    // Step 1 universal documents (every service type requires these).
    cnicFrontUrl:            { type: String, default: '' },
    cnicBackUrl:              { type: String, default: '' },

    // Step 2 — which of the 4 legal aid tracks this application is for.
    // Drives which Step 3 fields below are actually relevant/shown.
    serviceType: {
        type: String,
        enum: ['', 'representation', 'financial_aid', 'mediation', 'civil_identity'],
        default: ''
    },

    // Step 3 — conditional fields, populated depending on serviceType.
    // Representation / Mediation:
    currentLawyerInfo:       { type: String, default: '' },
    courtDocumentUrls:       { type: [String], default: [] }, // court summons / police reports

    // Financial Aid:
    employerName:            { type: String, default: '' },
    incomeSlipUrls:          { type: [String], default: [] },
    courtFeeInvoiceUrls:     { type: [String], default: [] },

    // Civil Identity:
    missingDocumentType:     { type: String, default: '' },
    supportingFamilyPaperUrls: { type: [String], default: [] },

    referenceId:            { type: String, default: '' },
    status: {
        type:    String,
        // Pending -> Under_Review -> Inquiry -> Accepted (Approved) / Rejected.
        // 'accepted' is kept as the terminal-success value (rather than
        // renaming to 'approved') since every existing screen, controller
        // check, and notification already reads status === 'accepted' —
        // renaming it would be a much larger, riskier change for no
        // functional gain. 'inquiry' is the new intermediate screening
        // stage this refactor adds.
        enum:    ['pending', 'under_review', 'inquiry', 'accepted', 'rejected'],
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
        date:        { type: Date, default: Date.now },
        // Stamped whenever the NGO side toggles this milestone, so the
        // client-facing timeline can show exactly when the update happened
        // (distinct from `date`, which can be a manually-set target/event
        // date rather than the moment of the status change itself).
        updatedByNgoAt: { type: Date, default: null }
    }],
    // NOTE: file storage for a case now lives in the shared DocumentVaultItem
    // collection (models/DocumentVaultItem.js), scoped by applicationId —
    // the same real-time, per-uploader-owned system already used for
    // lawyer/social-worker engagements. This inline `documents` array is
    // kept only so any pre-existing records written before this change
    // still read back without a schema error; new uploads go through
    // DocumentVaultItem via POST /api/ngos/case-tracking/:id/documents.
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
