const mongoose = require('mongoose');

/**
 * One rating per completed engagement, ever — enforced by the unique
 * index below, not just application logic, so a duplicate submission
 * can't slip through a race condition (e.g. a double-tap on "Submit").
 */
const RatingSchema = new mongoose.Schema({
    engagementId:   { type: mongoose.Schema.Types.ObjectId, ref: 'CaseEngagement', required: true },
    raterId:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // the client
    professionalId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // lawyer or social worker
    stars:          { type: Number, required: true, min: 1, max: 5 },
    comment:        { type: String, default: '' },
    createdAt:      { type: Date, default: Date.now },
});

RatingSchema.index({ engagementId: 1 }, { unique: true });

module.exports = mongoose.model('Rating', RatingSchema);
