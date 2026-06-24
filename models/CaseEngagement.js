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

    // ── Connection request context (set when status === 'REQUESTING') ──
    initialMessage:       { type: String, default: '' },
    initialAttachmentUrl: { type: String, default: '' },
    initialAttachmentType: {
        type: String,
        enum: ['', 'image', 'video', 'document'],
        default: ''
    },

    // ── Set only when a professional declines (status -> 'DISPUTED') ───
    // Kept separate from the billing-dispute meaning of DISPUTED — this is
    // specifically "professional declined a connection request", not a
    // payment dispute. A non-empty rejectionReason combined with no
    // financials activity is how the client UI tells the two apart.
    rejectionReason: { type: String, default: '' },

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
    if (typeof next === "function") next();
});

module.exports = mongoose.model('CaseEngagement', CaseEngagementSchema);
