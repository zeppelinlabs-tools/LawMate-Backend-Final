/**
 * Scraped Laws Routes
 * 
 * All routes require JWT authentication.
 * 
 * Available sources: federal, sindh, punjab, kpk, balochistan
 * 
 * ─── ENDPOINTS ───────────────────────────────────────────────────────────────
 * 
 * POST   /api/scraped-laws/:source/fetch        → Trigger scrape + AI enrich
 * GET    /api/scraped-laws/:source/status        → Check scrape progress
 * GET    /api/scraped-laws/:source/categories    → Categories with law counts
 * DELETE /api/scraped-laws/:source/cleanup-junk  → Remove non-law nav entries (source can be "all")
 * POST   /api/scraped-laws/:source/enrich-all    → Bulk re-enrich every pending law for a source
 * GET    /api/scraped-laws/:source               → Get all laws for a source
 * GET    /api/scraped-laws/:source/:id           → Get single law (full detail)
 * POST   /api/scraped-laws/:source/:id/enrich    → Re-enrich a law with AI
 * 
 * ─── QUERY PARAMS ────────────────────────────────────────────────────────────
 * 
 * lang   : "en" (default) or "ur"
 * page   : page number (default: 1)
 * limit  : results per page (default: 20)
 * search : search by law title
 * 
 * ─── EXAMPLES ────────────────────────────────────────────────────────────────
 * 
 * POST /api/scraped-laws/federal/fetch
 * POST /api/scraped-laws/sindh/fetch
 * 
 * GET  /api/scraped-laws/federal?lang=en&page=1&limit=20
 * GET  /api/scraped-laws/sindh?lang=ur&search=property
 * GET  /api/scraped-laws/punjab/status
 * GET  /api/scraped-laws/kpk/64abc123def?lang=ur
 * 
 * ─────────────────────────────────────────────────────────────────────────────
 */

const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware');
const {
    fetchAndStoreLaws,
    getLawsBySource,
    getLawById,
    getSourceStatus,
    reEnrichLaw,
    getCategoriesForSource,
    cleanupJunkLaws,
    enrichAllPending
} = require('../controllers/scrapedLawController');

// POST /:source/fetch — trigger scraping for a source
router.post('/:source/fetch', auth, fetchAndStoreLaws);

// GET /:source/status — check scraping progress
router.get('/:source/status', auth, getSourceStatus);

// GET /:source/categories — categories that have real laws for this region,
// used to build the Step-1 TabBar. Registered BEFORE /:source/:id so
// Express doesn't try to match "categories" as a law ID.
router.get('/:source/categories', auth, getCategoriesForSource);

// DELETE /:source/cleanup-junk — remove non-law nav entries (About Us,
// Contact Us, etc.) already saved before the title filter existed.
// source can be a real source name or "all". Registered before
// /:source/:id for the same reason as /categories above.
router.delete('/:source/cleanup-junk', auth, cleanupJunkLaws);

// POST /:source/enrich-all — bulk re-enrich every pending law for a
// source in one call instead of one request per law.
router.post('/:source/enrich-all', auth, enrichAllPending);

// GET /:source — get all stored laws for a source (paginated)
router.get('/:source', auth, getLawsBySource);

// GET /:source/:id — get single law full detail
router.get('/:source/:id', auth, getLawById);

// POST /:source/:id/enrich — re-enrich specific law with AI
router.post('/:source/:id/enrich', auth, reEnrichLaw);

module.exports = router;
