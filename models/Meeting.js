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
    status:       { type: String, enum: ['upcoming', 'completed', 'cancelled'], default: 'upcoming' },
    createdAt:    { type: Date, default: Date.now }
});

module.exports = mongoose.model('Meeting', MeetingSchema);
