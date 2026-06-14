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
    reEnrichLaw
} = require('../controllers/scrapedLawController');

// POST /:source/fetch — trigger scraping for a source
router.post('/:source/fetch', auth, fetchAndStoreLaws);

// GET /:source/status — check scraping progress
router.get('/:source/status', auth, getSourceStatus);

// GET /:source — get all stored laws for a source (paginated)
router.get('/:source', auth, getLawsBySource);

// GET /:source/:id — get single law full detail
router.get('/:source/:id', auth, getLawById);

// POST /:source/:id/enrich — re-enrich specific law with AI
router.post('/:source/:id/enrich', auth, reEnrichLaw);

module.exports = router;
