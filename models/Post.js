const mongoose = require('mongoose');

const PostSchema = new mongoose.Schema({
    userId: {
        type:     mongoose.Schema.Types.ObjectId,
        ref:      'User',
        required: true
    },
    title: {
        type:     String,
        required: true
    },
    content: {
        type:     String,
        required: true
    },
    imageUrl:   { type: String, default: '' }, // legacy single-image field, kept for old posts
    media: [{
        url:  { type: String, required: true },
        type: { type: String, enum: ['image', 'video'], required: true }
    }],
    tag:        { type: String, default: '' },
    likes:      { type: Number, default: 0 },
    likedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

    // Users who bookmarked/saved this post — needed for the Feed Profile
    // Hub's "Saved Posts" view (Part 5 of the connection-overhaul spec).
    savedBy:    [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

    // Real comment thread, replacing the old plain `comments: Number`
    // counter the seed script set (which had no matching schema field at
    // all, so Mongoose silently discarded it on save — confirming that
    // counter was never actually functional). authorId is needed so the
    // Feed Profile Hub's "My Commented Threads" view can find every post
    // where a given user has commented.
    comments: [{
        authorId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        authorName: { type: String, default: '' },
        text:       { type: String, required: true },
        createdAt:  { type: Date, default: Date.now },
    }],

    createdAt:  { type: Date, default: Date.now }
});

module.exports = mongoose.model('Post', PostSchema);
