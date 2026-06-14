const mongoose = require('mongoose');

const CaseEngagementSchema = new mongoose.Schema({

    // ── Participants ──────────────────────────────────────────
    clientId:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    lawyerId:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    socialWorkerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    // ── Engagement State ──────────────────────────────────────
    status: {
        type:    String,
        enum:    ['REQUESTING', 'FREE_INTAKE', 'PROPOSAL_SENT', 'ESCROW_LOCKED', 'COMPLETED', 'DISPUTED'],
        default: 'REQUESTING'
    },

    engagementType: {
        type:    String,
        enum:    ['CONSULTATION', 'FULL_HIRE', 'NONE'],
        default: 'NONE'
    },

    isFreeService: { type: Boolean, default: false },

    // ── Financials ────────────────────────────────────────────
    financials: {
        totalAmount:        { type: Number, default: 0 },
        platformCommission: { type: Number, default: 0 },
        professionalShare:  { type: Number, default: 0 },
        paymentStatus: {
            type:    String,
            enum:    ['UNPAID', 'HELD_IN_ESCROW', 'RELEASED', 'BYPASSED'],
            default: 'UNPAID'
        }
    },

    // ── Schedule ──────────────────────────────────────────────
    schedule: {
        appointmentTime:  { type: Date,   default: null },
        durationMinutes:  { type: Number, default: 0 },
        videoRoomId:      { type: String, default: '' }
    },

    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

CaseEngagementSchema.pre('save', function (next) {
    this.updatedAt = Date.now();
    next();
});

module.exports = mongoose.model('CaseEngagement', CaseEngagementSchema);
