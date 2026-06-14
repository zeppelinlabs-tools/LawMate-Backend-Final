/**
 * OTP Model
 * Tracks 6-digit verification codes with 15-minute expiry.
 * One active OTP per user at a time — old ones are replaced on resend.
 */
const mongoose = require('mongoose');

const OtpSchema = new mongoose.Schema({
    userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    email:     { type: String, required: true },
    phone:     { type: String, default: '' },
    code:      { type: String, required: true },       // 6-digit string
    method:    { type: String, enum: ['email', 'phone'], default: 'email' },
    expiresAt: { type: Date, required: true },          // Date.now() + 15 min
    isUsed:    { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

// Auto-delete expired OTPs after 1 hour using MongoDB TTL index
OtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 3600 });

module.exports = mongoose.model('Otp', OtpSchema);
