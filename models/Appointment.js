const mongoose = require('mongoose');

const AppointmentSchema = new mongoose.Schema({
    clientId:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    lawyerId:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    date:      { type: String, required: true },   // "2024-07-15"
    time:      { type: String, default: '' },       // "10:00 AM"
    reason:    { type: String, default: '' },
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected', 'completed'],
        default: 'pending'
    },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Appointment', AppointmentSchema);
