const mongoose = require('mongoose');

const BAR_COUNCILS = [
    'Pakistan Bar Council',
    'Punjab Bar Council',
    'Sindh Bar Council',
    'Khyber Pakhtunkhwa Bar Council',
    'Balochistan Bar Council',
    'Islamabad Bar Council',
    'Azad Jammu & Kashmir Bar Council',
    'Gilgit-Baltistan Bar Council'
];

const UserSchema = new mongoose.Schema({
    name:              { type: String, required: true },
    firstName:         { type: String, default: '' },
    lastName:          { type: String, default: '' },
    username:          { type: String, required: true, unique: true, trim: true },
    email:             { type: String, required: true, unique: true, lowercase: true, trim: true },
    password:          { type: String, required: true },
    phone:             { type: String, default: '' },
    profilePic:        { type: String, default: '' },
    dob:               { type: String, default: '' },
    gender:            { type: String, default: '' },
    city:              { type: String, default: '' },
    bio:               { type: String, default: '' },
    role: {
        type:    String,
        enum:    ['client', 'user', 'lawyer', 'admin', 'social_worker'],
        default: 'client'
    },
    isVerified:          { type: Boolean, default: false },
    // Set when a manual review (see lawyerController.setProfessionalVerification)
    // rejects a lawyer/social-worker application — lets them see why on
    // their profile/status screen instead of just staying invisible
    // with no explanation.
    verificationRejectionReason: { type: String, default: '' },
    isActive:            { type: Boolean, default: false },
    isAccountVerified:   { type: Boolean, default: false },
    verificationMethod:  { type: String, enum: ['email', 'phone'], default: 'email' },
    barNumber:           { type: String, default: '' },
    barCouncil:          { type: String, default: '' },
    barCouncilCardUrl:   { type: String, default: '' }, // legacy combined field — kept for old records
    cnicFrontBackUrl:    { type: String, default: '' }, // legacy combined field — kept for old records
    specialization:      { type: String, default: '' }, // legacy free-text field — kept for old records

    // ── Structured lawyer verification (5 separate documents) ──────────
    provincialBarCouncil: {
        type: String,
        enum: ['', 'Punjab', 'Sindh', 'KP', 'Balochistan', 'Islamabad', 'AJK', 'Gilgit-Baltistan'],
        default: ''
    },
    barRegistrationNumber: { type: String, default: '' },
    cnicNumber:             { type: String, default: '' }, // stored unmasked, 13 digits only
    licenseLevel:           { type: String, default: '' },
    isGeneralPractice:      { type: Boolean, default: false },
    areasOfPractice: {
        type: [String],
        enum: [
            'Criminal Law', 'Civil Law', 'Family Law', 'Corporate Law',
            'Property Law', 'Tax Law', 'Banking Law', 'Labor Law',
            'Cyber Law', 'Constitutional Law', 'IP Law', 'Inheritance Law',
            'Consumer Law', 'Immigration Law', 'Environmental Law'
        ],
        default: []
    },
    licenseCertificateUrl:  { type: String, default: '' },
    cnicFrontUrl:           { type: String, default: '' },
    cnicBackUrl:            { type: String, default: '' },
    barCouncilFrontUrl:     { type: String, default: '' },
    barCouncilBackUrl:      { type: String, default: '' },
    isVerifiedProfile:      { type: Boolean, default: false },

    yearsExp:            { type: Number, default: 0 },
    consultationFee:     { type: Number, default: 0 },
    languages:           { type: [String], default: [] },
    isAvailable:         { type: Boolean, default: true },
    casesHandled:        { type: Number, default: 0 },
    workType:            { type: String, default: '' },
    organization:        { type: String, default: '' },
    ngoRegistrationUrl:  { type: String, default: '' },
    // Additional NGO fields — filled when workType == 'organization'
    helpline:            { type: String, default: '' },
    alternatePhone:      { type: String, default: '' },
    headOfficeAddress:   { type: String, default: '' },
    website:             { type: String, default: '' },
    registrationNumber:  { type: String, default: '' },
    govtRegistrationDocUrl: { type: String, default: '' },
    verificationAuthority:  { type: String, default: '' },
    focusAreas:          { type: [String], default: [] },
    supportedCities:     { type: [String], default: [] },
    // Reference to the linked NGO record (set when NGO auto-created on registration)
    ngoId:               { type: require('mongoose').Schema.Types.ObjectId, ref: 'Ngo', default: null },
    fee:                 { type: Number, default: 0 },
    helpedCount:         { type: Number, default: 0 },
    withdrawableBalance: { type: Number, default: 0 },
    fcmToken:            { type: String, default: '' },
    bookmarkedLaws:      [{ type: mongoose.Schema.Types.ObjectId, ref: 'ScrapedLaw' }],
    notificationPreferences: {
        chatMessages:          { type: Boolean, default: true },
        connectionUpdates:     { type: Boolean, default: true },
        appointmentReminders:  { type: Boolean, default: true },
    },
    createdAt:           { type: Date, default: Date.now }
});

// FIXED: Converted middleware to standard synchronous execution assignment block 
// to prevent callback evaluation crashes in production deployment microservices
// Isme koi 'next' callback parameter nahi hai, isliye yeh kabhi crash nahi karega
UserSchema.pre('save', function () {
    if (this.isModified('username') && this.username) {
        this.username = this.username.toLowerCase().trim();
    }
    // Kisi next() ko call karne ki zaroorat nahi hai!
});

const UserModel = mongoose.model('User', UserSchema);
UserModel.BAR_COUNCILS = BAR_COUNCILS;

module.exports = UserModel;
