/**
 * Scraped Laws Controller
 * 
 * Handles:
 * - Triggering scrape + AI enrichment for each source
 * - Fetching stored laws by source
 * - Searching laws
 * - Getting a single law detail
 */

const ScrapedLaw = require('../models/ScrapedLaw');
const { enrichLaw } = require('../services/aiEnrichmentService');
const {
    scrapeAllFederal,
    scrapeSindh,
    scrapePunjab,
    scrapeKPK,
    scrapeBalochistan
} = require('../services/scraperService');

// Source config map
const SOURCE_CONFIG = {
    federal: {
        label: 'Federal Pakistan',
        scraper: scrapeAllFederal,
        baseUrl: 'https://pakistancode.gov.pk'
    },
    sindh: {
        label: 'Sindh Province',
        scraper: scrapeSindh,
        baseUrl: 'https://www.sindhlaws.gov.pk'
    },
    punjab: {
        label: 'Punjab Province',
        scraper: scrapePunjab,
        baseUrl: 'https://www.punjablaws.gov.pk'
    },
    kpk: {
        label: 'KPK Province',
        scraper: scrapeKPK,
        baseUrl: 'https://kpcode.kp.gov.pk'
    },
    balochistan: {
        label: 'Balochistan Province',
        scraper: scrapeBalochistan,
        baseUrl: 'https://balochistancode.gob.pk'
    }
};

// ─────────────────────────────────────────────
// HELPER: Process a batch of scraped laws
// Saves to DB, then AI-enriches each one
// ─────────────────────────────────────────────
async function processAndSaveLaws(scrapedList, source) {
    let saved = 0;
    let skipped = 0;
    let enriched = 0;
    let errors = [];

    for (const item of scrapedList) {
        try {
            // Check if already exists
            const existing = await ScrapedLaw.findOne({
                source,
                'title.en': item.title
            });

            if (existing) {
                skipped++;
                continue;
            }

            // Save basic record first
            const law = new ScrapedLaw({
                source,
                sourceUrl: item.link,
                title: { en: item.title, ur: '' },
                link: item.link,
                isEnriched: false
            });

            await law.save();
            saved++;

            // AI enrich immediately
            try {
                const aiData = await enrichLaw(item.title, source, item.link);

                law.title.ur = aiData.title_ur;
                law.summary = { en: aiData.summary_en, ur: aiData.summary_ur };
                law.keyPoints = { en: aiData.keyPoints_en, ur: aiData.keyPoints_ur };
                law.realLifeExample = { en: aiData.realLifeExample_en, ur: aiData.realLifeExample_ur };
                law.description = { en: aiData.description_en, ur: aiData.description_ur };
                law.isEnriched = true;
                law.enrichedAt = new Date();

                await law.save();
                enriched++;

                // Delay between AI calls to avoid rate limits
                await delay(800);
            } catch (aiErr) {
                errors.push({ title: item.title, error: aiErr.message });
            }

        } catch (err) {
            errors.push({ title: item.title, error: err.message });
        }
    }

    return { saved, skipped, enriched, errors };
}

// ─────────────────────────────────────────────
// POST /api/scraped-laws/:source/fetch
// Triggers scraping + enrichment for a source
// ─────────────────────────────────────────────
exports.fetchAndStoreLaws = async (req, res) => {
    const { source } = req.params;

    if (!SOURCE_CONFIG[source]) {
        return res.status(400).json({
            success: false,
            msg: `Invalid source. Valid options: ${Object.keys(SOURCE_CONFIG).join(', ')}`
        });
    }

    // Respond immediately — scraping is a background process
    res.json({
        success: true,
        msg: `Scraping started for ${SOURCE_CONFIG[source].label}. This runs in background. Check GET /api/scraped-laws/${source} to see progress.`
    });

    // Run scrape + enrich in background (don't await in response)
    setImmediate(async () => {
        try {
            console.log(`[SCRAPER] Starting scrape for source: ${source}`);
            const scrapedList = await SOURCE_CONFIG[source].scraper();
            console.log(`[SCRAPER] Found ${scrapedList.length} laws for ${source}`);

            if (scrapedList.length === 0) {
                console.warn(`[SCRAPER] No laws found for ${source} — website structure may have changed.`);
                return;
            }

            const result = await processAndSaveLaws(scrapedList, source);
            console.log(`[SCRAPER] Done for ${source}:`, result);
        } catch (err) {
            console.error(`[SCRAPER] Error for ${source}:`, err.message);
        }
    });
};

// ─────────────────────────────────────────────
// GET /api/scraped-laws/:source
// Get all stored laws for a source
// Query params: lang (en|ur), page, limit, search
// ─────────────────────────────────────────────
exports.getLawsBySource = async (req, res) => {
    const { source } = req.params;
    const { lang = 'en', page = 1, limit = 20, search = '' } = req.query;

    if (!SOURCE_CONFIG[source]) {
        return res.status(400).json({
            success: false,
            msg: `Invalid source. Valid options: ${Object.keys(SOURCE_CONFIG).join(', ')}`
        });
    }

    try {
        const query = { source };

        if (search) {
            query.$or = [
                { 'title.en': { $regex: search, $options: 'i' } },
                { 'title.ur': { $regex: search, $options: 'i' } }
            ];
        }

        const total = await ScrapedLaw.countDocuments(query);
        const laws = await ScrapedLaw.find(query)
            .skip((parseInt(page) - 1) * parseInt(limit))
            .limit(parseInt(limit))
            .sort({ 'title.en': 1 });

        // Format response based on requested language
        const formatted = laws.map(law => formatLaw(law, lang));

        res.json({
            success: true,
            source,
            sourceLabel: SOURCE_CONFIG[source].label,
            language: lang,
            total,
            page: parseInt(page),
            limit: parseInt(limit),
            totalPages: Math.ceil(total / parseInt(limit)),
            laws: formatted
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, msg: 'Server error', error: err.message });
    }
};

// ─────────────────────────────────────────────
// GET /api/scraped-laws/:source/:id
// Get a single law by ID with full detail
// Query params: lang (en|ur)
// ─────────────────────────────────────────────
exports.getLawById = async (req, res) => {
    const { source, id } = req.params;
    const { lang = 'en' } = req.query;

    try {
        const law = await ScrapedLaw.findOne({ _id: id, source });

        if (!law) {
            return res.status(404).json({ success: false, msg: 'Law not found' });
        }

        res.json({
            success: true,
            language: lang,
            law: formatLaw(law, lang, true)
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, msg: 'Server error', error: err.message });
    }
};

// ─────────────────────────────────────────────
// GET /api/scraped-laws/:source/status
// Shows how many laws are scraped & enriched
// ─────────────────────────────────────────────
exports.getSourceStatus = async (req, res) => {
    const { source } = req.params;

    if (!SOURCE_CONFIG[source]) {
        return res.status(400).json({
            success: false,
            msg: `Invalid source. Valid options: ${Object.keys(SOURCE_CONFIG).join(', ')}`
        });
    }

    try {
        const total = await ScrapedLaw.countDocuments({ source });
        const enriched = await ScrapedLaw.countDocuments({ source, isEnriched: true });
        const pending = total - enriched;

        res.json({
            success: true,
            source,
            sourceLabel: SOURCE_CONFIG[source].label,
            stats: {
                total,
                enriched,
                pending,
                percentComplete: total > 0 ? Math.round((enriched / total) * 100) : 0
            }
        });

    } catch (err) {
        res.status(500).json({ success: false, msg: 'Server error', error: err.message });
    }
};

// ─────────────────────────────────────────────
// POST /api/scraped-laws/:source/:id/enrich
// Manually re-enrich a single law with AI
// ─────────────────────────────────────────────
exports.reEnrichLaw = async (req, res) => {
    const { source, id } = req.params;

    try {
        const law = await ScrapedLaw.findOne({ _id: id, source });
        if (!law) return res.status(404).json({ success: false, msg: 'Law not found' });

        const aiData = await enrichLaw(law.title.en, source, law.link);

        law.title.ur = aiData.title_ur;
        law.summary = { en: aiData.summary_en, ur: aiData.summary_ur };
        law.keyPoints = { en: aiData.keyPoints_en, ur: aiData.keyPoints_ur };
        law.realLifeExample = { en: aiData.realLifeExample_en, ur: aiData.realLifeExample_ur };
        law.description = { en: aiData.description_en, ur: aiData.description_ur };
        law.isEnriched = true;
        law.enrichedAt = new Date();

        await law.save();

        res.json({
            success: true,
            msg: 'Law re-enriched successfully',
            law: formatLaw(law, 'en', true)
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, msg: 'Server error', error: err.message });
    }
};

// ─────────────────────────────────────────────
// HELPER: Format law response based on language
// ─────────────────────────────────────────────
function formatLaw(law, lang = 'en', fullDetail = false) {
    const base = {
        id: law._id,
        source: law.source,
        title: lang === 'ur' ? (law.title.ur || law.title.en) : law.title.en,
        summary: lang === 'ur' ? law.summary?.ur : law.summary?.en,
        keyPoints: lang === 'ur' ? law.keyPoints?.ur : law.keyPoints?.en,
        link: law.link,
        isEnriched: law.isEnriched
    };

    if (fullDetail) {
        base.realLifeExample = lang === 'ur' ? law.realLifeExample?.ur : law.realLifeExample?.en;
        base.description = lang === 'ur' ? law.description?.ur : law.description?.en;
        base.enrichedAt = law.enrichedAt;
        base.createdAt = law.createdAt;
        // Also include alternate language for switching
        base.titleAlt = lang === 'ur' ? law.title.en : law.title.ur;
    }

    return base;
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
