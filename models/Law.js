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
    },
    // Provincial / federal scope. Defaults to nationwide so existing laws
    // that never set this field still show up correctly under "Pakistan".
    region: {
        type: String,
        enum: ['pakistan', 'sindh', 'punjab', 'kpk', 'balochistan', 'federal'],
        default: 'pakistan'
    }
});

module.exports = mongoose.model('Law', LawSchema);
