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
                law.category = aiData.category;
                law.summary = { en: aiData.summary_en, ur: aiData.summary_ur };
                law.keyPoints = { en: aiData.keyPoints_en, ur: aiData.keyPoints_ur };
                law.realLifeExample = { en: aiData.realLifeExample_en, ur: aiData.realLifeExample_ur };
                law.description = { en: aiData.description_en, ur: aiData.description_ur };
                law.isEnriched = true;
                law.enrichedAt = new Date();
                law.lastEnrichmentError = ''; // clear any previous failure record

                await law.save();
                enriched++;

                // Delay between AI calls to avoid rate limits
                await delay(800);
            } catch (aiErr) {
                errors.push({ title: item.title, error: aiErr.message });
                // Persist the failure reason on the law itself so it's
                // queryable via GET /:source/status later, not only
                // visible in transient logs at the moment scraping ran.
                try {
                    law.lastEnrichmentError = aiErr.message;
                    await law.save();
                } catch (saveErr) {
                    console.error('[SCRAPER] Could not persist enrichment error:', saveErr.message);
                }
            }

        } catch (err) {
            errors.push({ title: item.title, error: err.message });
        }
    }

    // Print a clear, hard-to-miss summary the moment this background job
    // finishes, specifically calling out Anthropic billing/credit errors
    // since those are the most common silent failure mode here — without
    // this, the only trace was scattered inside the `errors` array that
    // nothing ever reads or persists.
    const billingErrors = errors.filter(e =>
        /credit balance|insufficient_quota|billing/i.test(e.error || '')
    );
    console.log(`\n========================================`);
    console.log(`[SCRAPER] Finished source: ${source}`);
    console.log(`  Saved: ${saved}  Skipped: ${skipped}  Enriched: ${enriched}  Errors: ${errors.length}`);
    if (billingErrors.length > 0) {
        console.log(`  ⚠️  ${billingErrors.length} failure(s) look like an Anthropic API billing/credit`);
        console.log(`     issue, not a code bug. Check your Anthropic Console balance.`);
        console.log(`     Example: ${billingErrors[0].error}`);
    } else if (errors.length > 0) {
        console.log(`  ⚠️  Errors occurred — first one: ${errors[0].error}`);
    }
    console.log(`========================================\n`);

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

    // Respond immediately — scraping is a background process. The actual
    // per-law success/failure detail (including any Anthropic API errors
    // such as a low credit balance) is only visible in server console
    // logs below — this used to be the ONLY place that information ever
    // existed, with no persisted record and no way to check it after the
    // fact except by watching live logs at the exact moment scraping ran.
    res.json({
        success: true,
        msg: `Scraping started for ${SOURCE_CONFIG[source].label}. This runs in background. Check GET /api/scraped-laws/${source}/status for enrichment progress, or server logs for detailed per-law errors.`
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
    const { lang = 'en', page = 1, limit = 20, search = '', category = '' } = req.query;

    if (!SOURCE_CONFIG[source]) {
        return res.status(400).json({
            success: false,
            msg: `Invalid source. Valid options: ${Object.keys(SOURCE_CONFIG).join(', ')}`
        });
    }

    try {
        const query = { source };

        // Step 2 of the navigation flow: category tab filtering. "all" or an
        // empty value means no filter (show every category for this region).
        if (category && category !== 'all') {
            query.category = category;
        }

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

        // Surface real failure reasons here so they're checkable via a
        // normal API call rather than only visible in transient server
        // logs at the exact moment the background scraping job ran.
        const failedLaws = await ScrapedLaw.find({
            source,
            isEnriched: false,
            lastEnrichmentError: { $ne: '' }
        }).select('title.en lastEnrichmentError').limit(5);

        res.json({
            success: true,
            source,
            sourceLabel: SOURCE_CONFIG[source].label,
            stats: {
                total,
                enriched,
                pending,
                percentComplete: total > 0 ? Math.round((enriched / total) * 100) : 0
            },
            recentEnrichmentFailures: failedLaws.map(l => ({
                title: l.title?.en,
                error: l.lastEnrichmentError
            }))
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
        law.category = aiData.category;
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
// ─────────────────────────────────────────────
// GET /api/scraped-laws/:source/categories
// Step 1 of the navigation flow: returns which categories actually have
// laws in this region, with a count for each, plus an "all" pseudo-entry.
// The frontend builds its TabBar from this rather than a hardcoded list,
// so a tab is never shown empty.
// ─────────────────────────────────────────────
const CATEGORY_LABELS = {
    family:         'Family Law',
    criminal:       'Criminal Law',
    business:       'Business Law',
    property:       'Property Law',
    labor:          'Labor Law',
    tax:            'Tax Law',
    constitutional: 'Constitutional Law',
    consumer:       'Consumer Law',
    cyber:          'Cyber Law',
    environmental:  'Environmental Law',
    civil:          'Civil Law',
    human_rights:   'Human Rights Law',
    uncategorized:  'Other',
};

exports.getCategoriesForSource = async (req, res) => {
    const { source } = req.params;

    if (!SOURCE_CONFIG[source]) {
        return res.status(400).json({
            success: false,
            msg: `Invalid source. Valid options: ${Object.keys(SOURCE_CONFIG).join(', ')}`
        });
    }

    try {
        const counts = await ScrapedLaw.aggregate([
            { $match: { source } },
            { $group: { _id: '$category', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]);

        const totalCount = counts.reduce((sum, c) => sum + c.count, 0);

        const categories = counts.map(c => ({
            value: c._id || 'uncategorized',
            label: CATEGORY_LABELS[c._id] || CATEGORY_LABELS.uncategorized,
            count: c.count,
        }));

        res.json({
            success: true,
            source,
            categories: [
                { value: 'all', label: 'All Laws', count: totalCount },
                ...categories,
            ],
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ success: false, msg: 'Server error' });
    }
};

function formatLaw(law, lang = 'en', fullDetail = false) {
    const base = {
        id: law._id,
        source: law.source,
        category: law.category || 'uncategorized',
        title: lang === 'ur' ? (law.title.ur || law.title.en) : law.title.en,
        summary: lang === 'ur' ? law.summary?.ur : law.summary?.en,
        keyPoints: lang === 'ur' ? law.keyPoints?.ur : law.keyPoints?.en,
        link: law.link,
        isEnriched: law.isEnriched,
        // Both languages included together (additive) so the frontend can
        // offer an instant English/Urdu toggle without a second network
        // round-trip, matching the rest of the app's existing UX pattern.
        titleUrdu: law.title?.ur || '',
        summaryUrdu: law.summary?.ur || '',
        keyPointsUrdu: law.keyPoints?.ur || [],
    };

    if (fullDetail) {
        base.realLifeExample = lang === 'ur' ? law.realLifeExample?.ur : law.realLifeExample?.en;
        base.description = lang === 'ur' ? law.description?.ur : law.description?.en;
        base.enrichedAt = law.enrichedAt;
        base.createdAt = law.createdAt;
        // Also include alternate language for switching
        base.titleAlt = lang === 'ur' ? law.title.en : law.title.ur;
        base.descriptionUrdu = law.description?.ur || '';
        base.realLifeExampleUrdu = law.realLifeExample?.ur || '';
    }

    return base;
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ─────────────────────────────────────────────
// DELETE /api/scraped-laws/:source/cleanup-junk
// Removes already-saved non-law entries (site navigation labels like
// "About Us", "Contact Us", "Category Wise", "Amendment" with no real
// act name) that were stored before the isRealLaw() filter in
// scraperService.js existed/was strengthened. Re-running the scraper
// alone does NOT remove these — it only stops NEW junk from being
// saved — so this is a one-time cleanup for what's already in the
// database. Safe to call again later; it's a no-op once junk is gone.
// ─────────────────────────────────────────────
const JUNK_TITLE_PATTERN = /^(About(\s+Us)?|Contact(\s+Us)?|FAQ|Home|Search|Login|Register|Privacy(\s+Policy)?|Terms(\s+(of\s+)?(Use|Service))?|Back|Next|Previous|Download|Print|Share|Links|Sitemap|Feedback|Help|Category\s*Wise|Document\s*Retrieval|Disclaimer|Amendment|Acts?|Ordinances?|Laws?|Rules?|Regulations?|Codes?|Bills?|Schedules?|Statutes?|Laws?\s+in\s+Alphabetical\s+Order)\s*$/i;

exports.cleanupJunkLaws = async (req, res) => {
    const { source } = req.params;

    if (source !== 'all' && !SOURCE_CONFIG[source]) {
        return res.status(400).json({
            success: false,
            msg: `Invalid source. Valid options: all, ${Object.keys(SOURCE_CONFIG).join(', ')}`
        });
    }

    try {
        const query = source === 'all' ? {} : { source };
        const candidates = await ScrapedLaw.find(query).select('title.en source');

        const junkIds = candidates
            .filter(l => {
                const t = (l.title?.en || '').trim();
                // Reject if it matches the junk pattern outright, OR if
                // it's under 3 words (same "too short to be a real law
                // title" rule used going forward in isRealLaw()).
                return JUNK_TITLE_PATTERN.test(t) || t.split(/\s+/).length < 3;
            })
            .map(l => l._id);

        if (junkIds.length === 0) {
            return res.json({ success: true, msg: 'No junk entries found.', deletedCount: 0, deletedTitles: [] });
        }

        const deletedTitles = candidates
            .filter(l => junkIds.includes(l._id))
            .map(l => l.title?.en);

        await ScrapedLaw.deleteMany({ _id: { $in: junkIds } });

        res.json({
            success: true,
            msg: `Removed ${junkIds.length} non-law entries.`,
            deletedCount: junkIds.length,
            deletedTitles,
        });
    } catch (err) {
        console.error('[CLEANUP JUNK]', err.message);
        res.status(500).json({ success: false, msg: 'Server error', error: err.message });
    }
};

// ─────────────────────────────────────────────
// POST /api/scraped-laws/:source/enrich-all
// Bulk re-enrich every un-enriched law for a source in one call,
// instead of needing one POST /:id/enrich per law. Responds
// immediately (same background-job pattern as fetchAndStoreLaws) since
// enriching 100+ laws one at a time, with a rate-limit delay between
// each, can take several minutes — checkable via GET /:source/status.
// ─────────────────────────────────────────────
exports.enrichAllPending = async (req, res) => {
    const { source } = req.params;

    if (!SOURCE_CONFIG[source]) {
        return res.status(400).json({
            success: false,
            msg: `Invalid source. Valid options: ${Object.keys(SOURCE_CONFIG).join(', ')}`
        });
    }

    const pending = await ScrapedLaw.find({ source, isEnriched: false });

    if (pending.length === 0) {
        return res.json({ success: true, msg: 'Nothing to enrich — every law for this source is already enriched.' });
    }

    res.json({
        success: true,
        msg: `Enriching ${pending.length} laws in the background. Check GET /api/scraped-laws/${source}/status for progress.`
    });

    setImmediate(async () => {
        let done = 0, failed = 0;
        for (const law of pending) {
            try {
                const aiData = await enrichLaw(law.title.en, source, law.link);
                law.title.ur = aiData.title_ur;
                law.category = aiData.category;
                law.summary = { en: aiData.summary_en, ur: aiData.summary_ur };
                law.keyPoints = { en: aiData.keyPoints_en, ur: aiData.keyPoints_ur };
                law.realLifeExample = { en: aiData.realLifeExample_en, ur: aiData.realLifeExample_ur };
                law.description = { en: aiData.description_en, ur: aiData.description_ur };
                law.isEnriched = true;
                law.enrichedAt = new Date();
                law.lastEnrichmentError = '';
                await law.save();
                done++;
            } catch (err) {
                failed++;
                try {
                    law.lastEnrichmentError = err.message;
                    await law.save();
                } catch (_) { /* best-effort */ }
            }
            await delay(800); // same rate-limit spacing as the scrape-time enrichment
        }
        console.log(`[BULK ENRICH] ${source}: done=${done} failed=${failed} of ${pending.length}`);
    });
};
