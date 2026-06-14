const mongoose = require('mongoose');

// ── NGO Application ───────────────────────────────────────────
const NgoApplicationSchema = new mongoose.Schema({
    ngoId:                  { type: mongoose.Schema.Types.ObjectId, ref: 'Ngo', required: true },
    applicantId:            { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    applicantName:          { type: String, default: '' },
    phone:                  { type: String, default: '' },
    issueType:              { type: String, default: '' },
    caseFocusCategory:      { type: String, default: '' },
    applicantMonthlyIncome: { type: String, default: '' },
    caseSummary:            { type: String, default: '' },
    description:            { type: String, default: '' },
    attachedDocuments:      { type: [String], default: [] },
    status: {
        type:    String,
        enum:    ['pending', 'reviewed', 'accepted', 'rejected', 'Pending Triage'],
        default: 'pending'
    },
    createdAt: { type: Date, default: Date.now }
});

// ── NGO ───────────────────────────────────────────────────────
const NgoSchema = new mongoose.Schema({
    name:                   { type: String, required: true },
    subtitle:               { type: String, default: '' },
    description:            { type: String, default: '' },
    founderOrLeader:        { type: String, default: '' },
    city:                   { type: String, default: '' },
    address:                { type: String, default: '' },
    phone:                  { type: String, default: '' },
    helpline:               { type: String, default: '' },
    alternatePhone:         { type: String, default: '' },
    email:                  { type: String, default: '' },
    website:                { type: String, default: '' },
    logoUrl:                { type: String, default: '' },

    // Support both focusAreas and categories for compatibility
    focusAreas:             { type: [String], default: [] },
    categories:             { type: [String], default: [] },
    supportedCities:        { type: [String], default: [] },
    requiredDocuments:      { type: [String], default: [] },

    verificationAuthority:  { type: String, default: '' },
    isVerified:             { type: Boolean, default: false },
    isActive:               { type: Boolean, default: true },
    ownerId:                { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt:              { type: Date, default: Date.now }
});

const Ngo            = mongoose.model('Ngo', NgoSchema);
const NgoApplication = mongoose.model('NgoApplication', NgoApplicationSchema);

module.exports = { Ngo, NgoApplication };
