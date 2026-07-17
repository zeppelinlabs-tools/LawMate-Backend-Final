const mongoose = require('mongoose');

const MeetingSchema = new mongoose.Schema({
    engagementId: { type: mongoose.Schema.Types.ObjectId, ref: 'CaseEngagement', required: true },
    lawyerId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    clientId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    billId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Bill' },
    title:        { type: String, default: 'Meeting' },
    date:         { type: Date, required: true },
    time:         { type: String, required: true },
    type:         { type: String, enum: ['online', 'physical'], default: 'online' },
    address:      { type: String, default: '' },
    notes:        { type: String, default: '' },
    // 'upcoming' until the meeting time passes and both sides' responses
    // are resolved into a final outcome. 'completed' is kept as a legacy
    // alias status a lawyer can still set manually (e.g. for an in-person
    // meeting logged after the fact) — the new real attendance flow
    // resolves into 'attended' / 'missed' / 'dismissed' instead.
    status:       { type: String, enum: ['upcoming', 'attended', 'missed', 'dismissed', 'completed', 'cancelled'], default: 'upcoming' },

    // Each side's own response to the "are you attending" prompt shown
    // when the meeting starts. 'pending' means they never responded at
    // all (silence) — distinct from 'dismissed', an explicit decline.
    clientResponse:       { type: String, enum: ['pending', 'joined', 'dismissed'], default: 'pending' },
    professionalResponse: { type: String, enum: ['pending', 'joined', 'dismissed'], default: 'pending' },
    clientRespondedAt:       { type: Date, default: null },
    professionalRespondedAt: { type: Date, default: null },

    // Reminder de-dupe flags — the cron checks every minute, these stop
    // the same reminder firing repeatedly within its check window.
    reminder15SentAt:    { type: Date, default: null },
    reminderStartSentAt: { type: Date, default: null },
    resolvedAt:           { type: Date, default: null },

    createdAt:    { type: Date, default: Date.now }
});

module.exports = mongoose.model('Meeting', MeetingSchema);
