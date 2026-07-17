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

    // Topic category — fixed taxonomy so TabBar filtering is reliable.
    // 'uncategorized' is the default for laws scraped/enriched before this
    // field existed; the backfill script (scripts/backfillLawCategories.js)
    // assigns a real category to those.
    category: {
        type: String,
        enum: [
            'family', 'criminal', 'business', 'property', 'labor',
            'tax', 'constitutional', 'consumer', 'cyber', 'environmental',
            'civil', 'human_rights', 'uncategorized'
        ],
        default: 'uncategorized'
    },

    // Subject-matter category, distinct from `source` (which is the
    // region/province). Assigned automatically by aiEnrichmentService during
    // scraping (see controllers/scrapedLawController.js). This field was
    // referenced throughout the controller (assignment, filtering, the
    // /categories aggregation) but never actually declared on the schema —
    // every `law.category = ...` write was silently going nowhere reliable.
    category: {
        type: String,
        enum: [
            'family', 'criminal', 'business', 'property', 'labor',
            'tax', 'constitutional', 'consumer', 'cyber', 'environmental',
            'civil', 'human_rights', 'uncategorized'
        ],
        default: 'uncategorized',
        index: true
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

    // Persists the exact reason enrichment failed (e.g. an Anthropic API
    // billing error), so it's queryable later via GET /:source/status
    // rather than only existing in transient console logs at the moment
    // the background scraping job ran.
    lastEnrichmentError: {
        type: String,
        default: ''
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
ScrapedLawSchema.index({ category: 1 });
ScrapedLawSchema.index({ source: 1, category: 1 });
ScrapedLawSchema.index({ 'title.en': 'text', 'title.ur': 'text' });

// Update `updatedAt` on save
ScrapedLawSchema.pre('save', function () {
    this.updatedAt = Date.now();
});
module.exports = mongoose.model('ScrapedLaw', ScrapedLawSchema);
