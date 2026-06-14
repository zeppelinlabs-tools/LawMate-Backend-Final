const mongoose = require('mongoose');

const LawCategorySchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    description: {
        type: String
    }
});

module.exports = mongoose.model('LawCategory', LawCategorySchema);