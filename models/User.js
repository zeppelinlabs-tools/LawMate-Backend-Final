const mongoose = require('mongoose');

// Official Pakistan Bar Councils
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
    // ── Basic Info ────────────────────────────────────────────
    name:             { type: String, required: true },
    firstName:        { type: String, default: '' },
    lastName:         { type: String, default: '' },
    username:         { type: String, required: true, unique: true, trim: true },
    email:            { type: String, required: true, unique: true, lowercase: true, trim: true },
    password:         { type: String, required: true },
    phone:            { type: String, default: '' },
    profilePic:       { type: String, default: '' },
    dob:              { type: String, default: '' },
    gender:           { type: String, default: '' },
    city:             { type: String, default: '' },
    bio:              { type: String, default: '' },

    // ── Role ──────────────────────────────────────────────────
    role: {
        type:    String,
        enum:    ['client', 'lawyer', 'admin', 'social_worker', 'user'],
        default: 'client'
    },

    // ── Verification & Account Status ─────────────────────────
    // client/user → isVerified: true immediately
    // lawyer/social_worker → isVerified: false until admin approves
    isVerified:          { type: Boolean, default: false },
    isActive:            { type: Boolean, default: false },
    isAccountVerified:   { type: Boolean, default: false }, // OTP email/phone verified
    verificationMethod:  { type: String, enum: ['email', 'phone'], default: 'email' },

    // ── Lawyer-specific fields ────────────────────────────────
    barNumber:           { type: String, default: '' },
    barCouncil: {
        type:    String,
        enum:    [...BAR_COUNCILS, ''],
        default: ''
    },
    barCouncilCardUrl:   { type: String, default: '' }, // uploaded file path
    cnicFrontBackUrl:    { type: String, default: '' }, // uploaded file path
    specialization:      { type: String, default: '' },
    yearsExp:            { type: Number, default: 0 },
    consultationFee:     { type: Number, default: 0 },
    languages:           { type: [String], default: [] },
    isAvailable:         { type: Boolean, default: true },
    casesHandled:        { type: Number, default: 0 },

    // ── Social Worker / NGO fields ────────────────────────────
    workType:            { type: String, default: '' },
    organization:        { type: String, default: '' },
    ngoRegistrationUrl:  { type: String, default: '' }, // uploaded credential file
    fee:                 { type: Number, default: 0 },
    helpedCount:         { type: Number, default: 0 },

    // ── Notification Preferences ──────────────────────────────
    notificationPreferences: {
        chatMessages:         { type: Boolean, default: true },
        connectionUpdates:    { type: Boolean, default: true },
        appointmentReminders: { type: Boolean, default: true }
    },

    // ── Withdrawable Balance ──────────────────────────────────
    withdrawableBalance: { type: Number, default: 0 },

    // ── FCM Push Token ────────────────────────────────────────
    fcmToken:            { type: String, default: '' },

    createdAt: { type: Date, default: Date.now }
});

// ── Pre-save hook: username validation ────────────────────────
UserSchema.pre('save', function (next) {
    if (this.isModified('username') && this.username) {
        this.username = this.username.toLowerCase().trim();
    }
    next();
});
});
const UserModel = mongoose.model('User', UserSchema);
UserModel.BAR_COUNCILS = BAR_COUNCILS;
module.exports = UserModel;
