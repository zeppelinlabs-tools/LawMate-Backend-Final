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
    imageUrl:   { type: String, default: '' },
    tag:        { type: String, default: '' },
    likes:      { type: Number, default: 0 },
    likedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    createdAt:  { type: Date, default: Date.now }
});

module.exports = mongoose.model('Post', PostSchema);
