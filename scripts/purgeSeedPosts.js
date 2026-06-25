/**
 * One-time cleanup script: removes the hardcoded sample post(s) that
 * seed.js inserts directly into the live Post collection.
 *
 * Why this exists: controllers/feedController.js's GET /api/feed already
 * queries Post.find() with zero mock arrays in the code — the feed
 * endpoint itself was never the problem. The "mock data in the feed"
 * symptom came from seed.js having actually been run against the real
 * database at some point, which permanently inserted a fake post
 * ("Supreme Court New Guidelines" by a fabricated "Ahmed Khan" user) that
 * the feed then correctly displays, because as far as the database is
 * concerned it's indistinguishable from genuine user content.
 *
 * This script targets ONLY that exact known seed content by title match —
 * it does NOT wipe the whole Post collection, since real users may have
 * already posted genuine content that must not be touched.
 *
 * Usage:
 *   node scripts/purgeSeedPosts.js              → delete the known seed post(s)
 *   node scripts/purgeSeedPosts.js --dry-run     → show what would be deleted, no writes
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Post = require('../models/Post');

// Exact titles seed.js is known to insert. Add to this list if more
// seeded content is found later — keep it an explicit allow-list rather
// than a heuristic, so this can never accidentally delete a real user's
// post that happens to share innocuous wording.
const KNOWN_SEED_TITLES = [
    'Supreme Court New Guidelines',
];

async function run() {
    const dryRun = process.argv.includes('--dry-run');

    if (!process.env.MONGO_URI) {
        console.error('❌ No MONGO_URI found in environment. Aborting.');
        process.exit(1);
    }

    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    const query = { title: { $in: KNOWN_SEED_TITLES } };
    const matches = await Post.find(query);

    console.log(`📊 Found ${matches.length} seeded post(s) matching known seed titles.`);
    matches.forEach(p => console.log(`   - "${p.title}" (${p._id})`));

    if (matches.length === 0) {
        console.log('✅ Nothing to purge. Exiting.');
        await mongoose.disconnect();
        return;
    }

    if (dryRun) {
        console.log('🧪 --dry-run set: not deleting anything.');
        await mongoose.disconnect();
        return;
    }

    const result = await Post.deleteMany(query);
    console.log(`✅ Deleted ${result.deletedCount} seeded post(s).`);

    await mongoose.disconnect();
}

run().catch(err => {
    console.error('❌ Fatal error in purge script:', err);
    process.exit(1);
});
