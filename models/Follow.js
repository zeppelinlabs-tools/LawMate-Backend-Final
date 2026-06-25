const mongoose = require('mongoose');

// A single document represents "followerId follows followingId".
// Indexed + unique on the pair so the same follow can never be duplicated.
const FollowSchema = new mongoose.Schema({
    followerId:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    followingId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    createdAt:   { type: Date, default: Date.now }
});

FollowSchema.index({ followerId: 1, followingId: 1 }, { unique: true });
FollowSchema.index({ followingId: 1 }); // fast lookup: "who follows this user"
FollowSchema.index({ followerId: 1 });  // fast lookup: "who does this user follow"

module.exports = mongoose.model('Follow', FollowSchema);

