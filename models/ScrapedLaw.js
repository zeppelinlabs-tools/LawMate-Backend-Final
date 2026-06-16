const mongoose = require('mongoose');

const ScrapedLawSchema = new mongoose.Schema({
    // Source identification
    source: {
        type: String,
        required: true,
        enum: ['federal', 'sindh', 'punjab', 'kpk', 'balochistan']
    },
    sourceUrl: {
        type: String,
        required: true
    },

    // Title in both languages
    title: {
        en: { type: String, required: true },
        ur: { type: String, default: '' }
    },

    // 5-6 line summary of what the law is about and what rights it gives
    summary: {
        en: { type: String, default: '' },
        ur: { type: String, default: '' }
    },

    // Key points / main things the law provides (5-8 points)
    keyPoints: {
        en: [{ type: String }],
        ur: [{ type: String }]
    },

    // Real-life example of how the law is implemented
    realLifeExample: {
        en: { type: String, default: '' },
        ur: { type: String, default: '' }
    },

    // Full 8-9 line description for users who want to learn more
    description: {
        en: { type: String, default: '' },
        ur: { type: String, default: '' }
    },

    // Original government website link
    link: {
        type: String,
        required: true
    },

    // Track AI enrichment status
    isEnriched: {
        type: Boolean,
        default: false
    },

    enrichedAt: {
        type: Date
    },

    createdAt: {
        type: Date,
        default: Date.now
    },

    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Index for fast filtering by source
ScrapedLawSchema.index({ source: 1 });
ScrapedLawSchema.index({ 'title.en': 'text', 'title.ur': 'text' });

// Update `updatedAt` on save
ScrapedLawSchema.pre('save', function (next) {
    this.updatedAt = Date.now();
    if (typeof next === "function") next();
});

module.exports = mongoose.model('ScrapedLaw', ScrapedLawSchema);
