/**
 * One-time backfill script: assigns a real subject-matter `category` to
 * every existing ScrapedLaw document that doesn't have one yet.
 *
 * Why this exists: aiEnrichmentService.enrichLaw() and the controller logic
 * for assigning/filtering/aggregating by category were already built and
 * wired correctly, but the Mongoose schema never declared the `category`
 * field — so every law scraped before that schema fix was saved with no
 * usable category, and would show up under "uncategorized" / "Other" in
 * the Step-1 TabBar forever unless backfilled.
 *
 * This script re-uses the EXACT SAME enrichLaw() call used by live
 * scraping, but only targets laws that are missing a category (or are
 * explicitly 'uncategorized'), so it never re-spends AI calls on laws
 * that are already correctly tagged.
 *
 * Usage:
 *   node scripts/backfillLawCategories.js                 → backfill ALL sources
 *   node scripts/backfillLawCategories.js sindh            → backfill one source only
 *   node scripts/backfillLawCategories.js --dry-run        → count only, no writes/AI calls
 */

require('dotenv').config();
const mongoose = require('mongoose');
const ScrapedLaw = require('../models/ScrapedLaw');
const { enrichLaw } = require('../services/aiEnrichmentService');

const VALID_SOURCES = ['federal', 'sindh', 'punjab', 'kpk', 'balochistan'];

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
    const args = process.argv.slice(2);
    const dryRun = args.includes('--dry-run');
    const sourceArg = args.find(a => VALID_SOURCES.includes(a));

    if (!process.env.MONGO_URI) {
        console.error('❌ No MONGO_URI found in environment. Aborting.');
        process.exit(1);
    }

    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    const query = {
        $or: [
            { category: { $exists: false } },
            { category: null },
            { category: 'uncategorized' },
        ],
    };
    if (sourceArg) {
        query.source = sourceArg;
        console.log(`🔎 Scoped to source: ${sourceArg}`);
    } else {
        console.log('🔎 Scanning ALL sources');
    }

    const total = await ScrapedLaw.countDocuments(query);
    console.log(`📊 Found ${total} law(s) needing a category.`);

    if (total === 0) {
        console.log('✅ Nothing to backfill. Exiting.');
        await mongoose.disconnect();
        return;
    }

    if (dryRun) {
        console.log('🧪 --dry-run set: not calling AI or writing anything.');
        const bySource = await ScrapedLaw.aggregate([
            { $match: query },
            { $group: { _id: '$source', count: { $sum: 1 } } },
        ]);
        console.log('Breakdown by source:', bySource);
        await mongoose.disconnect();
        return;
    }

    let processed = 0;
    let succeeded = 0;
    let failed = 0;
    const failures = [];

    const cursor = ScrapedLaw.find(query).cursor();

    for (let law = await cursor.next(); law != null; law = await cursor.next()) {
        processed++;
        try {
            const titleForAi = law.title?.en || '';
            if (!titleForAi) {
                console.warn(`⚠️  Skipping ${law._id} — no English title to categorize from.`);
                failed++;
                failures.push({ id: law._id.toString(), error: 'no title.en' });
                continue;
            }

            const aiData = await enrichLaw(titleForAi, law.source, law.link);

            // Only touch the category field here — this script's sole job is
            // categorization, not re-running the full enrichment pipeline.
            // If the law was already enriched with summary/keyPoints/etc,
            // those are left untouched; only a genuinely missing category
            // is filled in.
            law.category = aiData.category;
            await law.save();

            succeeded++;
            console.log(`✅ [${processed}/${total}] "${titleForAi.slice(0, 60)}" → ${aiData.category}`);

            // Match the same rate-limit-friendly delay used by live scraping.
            await delay(800);
        } catch (err) {
            failed++;
            failures.push({ id: law._id.toString(), error: err.message });
            console.error(`❌ [${processed}/${total}] Failed for ${law._id}: ${err.message}`);
        }
    }

    console.log('\n──────────────────────────────────────────');
    console.log(`Backfill complete: ${succeeded} succeeded, ${failed} failed, ${processed} processed.`);
    if (failures.length > 0) {
        console.log('Failures:', JSON.stringify(failures, null, 2));
    }
    console.log('──────────────────────────────────────────\n');

    await mongoose.disconnect();
}

run().catch(err => {
    console.error('❌ Fatal error in backfill script:', err);
    process.exit(1);
});
