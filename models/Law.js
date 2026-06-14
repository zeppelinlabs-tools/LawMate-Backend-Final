const mongoose = require('mongoose');

const LawSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true
    },
    description: {
        type: String,
        required: true
    },
    categoryId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'LawCategory'
    }
});

module.exports = mongoose.model('Law', LawSchema);