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
        enum:    ['client', 'lawyer', 'admin', 'social_worker', 'user'],
        default: 'client'
    },
    isVerified:          { type: Boolean, default: false },
    isActive:            { type: Boolean, default: false },
    isAccountVerified:   { type: Boolean, default: false },
    verificationMethod:  { type: String, enum: ['email', 'phone'], default: 'email' },
    barNumber:           { type: String, default: '' },
    barCouncil:          { type: String, default: '' },
    barCouncilCardUrl:   { type: String, default: '' },
    cnicFrontBackUrl:    { type: String, default: '' },
    specialization:      { type: String, default: '' },
    yearsExp:            { type: Number, default: 0 },
    consultationFee:     { type: Number, default: 0 },
    languages:           { type: [String], default: [] },
    isAvailable:         { type: Boolean, default: true },
    casesHandled:        { type: Number, default: 0 },
    workType:            { type: String, default: '' },
    organization:        { type: String, default: '' },
    ngoRegistrationUrl:  { type: String, default: '' },
    fee:                 { type: Number, default: 0 },
    helpedCount:         { type: Number, default: 0 },
    notificationPreferences: {
        chatMessages:         { type: Boolean, default: true },
        connectionUpdates:    { type: Boolean, default: true },
        appointmentReminders: { type: Boolean, default: true }
    },
    withdrawableBalance: { type: Number, default: 0 },
    fcmToken:            { type: String, default: '' },
    createdAt:           { type: Date, default: Date.now }
});

// FIXED: Converted middleware to standard synchronous execution assignment block 
// to prevent callback evaluation crashes in production deployment microservices
UserSchema.pre('save', function (next) {
    if (this.isModified('username') && this.username) {
        this.username = this.username.toLowerCase().trim();
    }
    // Only trigger next execution callback if it exists
    if (typeof next === 'function') {
        next();
    }
});

const UserModel = mongoose.model('User', UserSchema);
UserModel.BAR_COUNCILS = BAR_COUNCILS;

module.exports = UserModel;
