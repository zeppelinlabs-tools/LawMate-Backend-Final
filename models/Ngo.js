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
        updatedByNgoAt: { type: Date, default: null },
        // Sub-steps break a milestone into the actual concrete things the
        // NGO has to check off (e.g. under "Document Collection": one
        // sub-step per required document — "Income slip received",
        // "Court fee invoice verified", etc). Auto-seeded from the
        // application's submitted documents at case-acceptance time (see
        // buildDefaultMilestones in ngoController.js), and the NGO can add
        // more of their own from the workspace. When a milestone has any
        // sub-steps, its own `status` is derived automatically (done only
        // once every sub-step is done) rather than being toggled directly
        // — see updateSubStep below.
        subSteps: [{
            label:          { type: String, required: true },
            isDone:         { type: Boolean, default: false },
            updatedByNgoAt: { type: Date, default: null },
            createdAt:      { type: Date, default: Date.now },
            // The client's own submission for this sub-step — e.g. the
            // actual income slip file for a "Provide income slip"
            // sub-step. Set only by the client (submitSubStepDocument);
            // isDone above is still only ever set by the NGO, once they've
            // opened and reviewed what the client submitted — submitting
            // a file does not auto-complete the step.
            submittedFileUrl: { type: String, default: '' },
            submittedFileName:{ type: String, default: '' },
            submittedAt:      { type: Date, default: null },
        }]
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

// ── NGO Case Document ────────────────────────────────────────────────────────
// The formal completion document for a case — generated only once every
// milestone is done, then pushed to the client to review and sign, and
// finally finalized so both sides have a permanent, downloadable record.
// Deliberately a flat snapshot of names/details rather than live refs to
// User/Ngo/NgoApplication: once this exists it's meant to read the same
// way forever, even if the underlying profile records change later — the
// whole point is that it stands as evidence of what was true and agreed
// at the time.
const CaseDocumentSchema = new mongoose.Schema({
    applicationId: { type: mongoose.Schema.Types.ObjectId, ref: 'NgoApplication', required: true, unique: true },
    ngoId:         { type: mongoose.Schema.Types.ObjectId, ref: 'Ngo', required: true },

    status: {
        type: String,
        enum: ['draft', 'pushed', 'signed_by_client', 'finalized'],
        default: 'draft'
    },

    // ── NGO letterhead snapshot ──────────────────────────────
    ngoName:               { type: String, default: '' },
    ngoRegistrationNumber: { type: String, default: '' },
    ngoAddress:            { type: String, default: '' },
    ngoLogoUrl:            { type: String, default: '' },

    // ── Client snapshot ───────────────────────────────────────
    clientName:  { type: String, default: '' },
    clientCnic:  { type: String, default: '' },
    clientPhone: { type: String, default: '' },
    clientEmail: { type: String, default: '' },

    // ── Case details ──────────────────────────────────────────
    caseTitle:    { type: String, default: '' },
    caseSummary:  { type: String, default: '' },
    serviceType:  { type: String, default: '' },
    referenceId:  { type: String, default: '' },

    // Exactly the date the client's application was submitted — NOT the
    // date this document was generated. Read from NgoApplication.createdAt
    // at generation time and never touched again.
    dateApplied:   { type: Date, required: true },
    dateGenerated: { type: Date, default: Date.now },

    // What was actually done for the client, as free text the NGO fills
    // in at generation time (e.g. "Represented client in labor tribunal
    // proceedings and recovered PKR 120,000 in unpaid wages").
    resolutionSummary: { type: String, default: '' },

    // Optional — only relevant if a lawyer was engaged as part of this
    // case. Left entirely blank/omitted from the rendered document when
    // not applicable.
    lawyerAssigned: {
        name:               { type: String, default: '' },
        barNumber:          { type: String, default: '' },
        ngoPaysLawyer:      { type: Boolean, default: false },
        feeArrangementNote: { type: String, default: '' }
    },

    // Optional extra agreement/terms text — entirely skippable by the NGO.
    additionalAgreementNotes: { type: String, default: '' },

    // Message the NGO sends along when pushing the draft to the client
    // (e.g. "Please review and sign below").
    pushNote: { type: String, default: '' },

    // ── Signatures ────────────────────────────────────────────
    // Lightweight typed-name e-signature with a timestamp, rather than a
    // drawn signature pad — functionally equivalent as an attestation
    // ("I, <name>, agree to and sign this document") and far more
    // reliable across devices than canvas capture. signatureImageUrl is
    // included as an optional upgrade path (e.g. an uploaded scanned
    // signature) without being required.
    ngoSignerName:    { type: String, default: '' },
    ngoSignerTitle:   { type: String, default: '' }, // e.g. "Head of NGO"
    ngoSignedAt:      { type: Date, default: null },
    ngoSignatureUrl:  { type: String, default: '' },

    clientSignerName:   { type: String, default: '' },
    clientSignedAt:     { type: Date, default: null },
    clientSignatureUrl: { type: String, default: '' },

    finalizedAt: { type: Date, default: null },

    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

const CaseDocument = mongoose.model('CaseDocument', CaseDocumentSchema);

module.exports = { Ngo, NgoApplication, NgoCaseTracking, CaseDocument };
