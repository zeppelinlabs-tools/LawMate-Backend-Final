const mongoose = require('mongoose');

const BillSchema = new mongoose.Schema({
    engagementId: { type: mongoose.Schema.Types.ObjectId, ref: 'CaseEngagement', required: true },
    lawyerId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    clientId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title:        { type: String, required: true },
    amount:       { type: Number, required: true, default: 0 },
    notes:        { type: String, default: '' },
    status:       { type: String, enum: ['pending', 'paid', 'cancelled'], default: 'pending' },
    paidAt:       { type: Date },
    meetingDate:  { type: Date },
    meetingTime:  { type: String, default: '' },
    meetingType:  { type: String, enum: ['online', 'physical'], default: 'online' },
    meetingAddress: { type: String, default: '' },
    createdAt:    { type: Date, default: Date.now }
});

module.exports = mongoose.model('Bill', BillSchema);
