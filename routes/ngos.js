/**
 * NGO Routes
 *
 * ⚠️  IMPORTANT: /apply must be registered BEFORE /:id
 * Otherwise Express matches "apply" as an :id parameter
 * and the route returns 404.
 *
 * GET  /api/ngos                   → List all active NGOs (public)
 * GET  /api/ngos/:id               → Get single NGO (public)
 * POST /api/ngos                   → Create NGO (auth)
 * POST /api/ngos/apply             → Apply to NGO (auth)
 * GET  /api/ngos/:id/applications  → Get applications (auth — owner only)
 */

const express = require('express');
const router  = express.Router();
const auth    = require('../middleware/authMiddleware');
const ctrl    = require('../controllers/ngoController');

// ── Public routes ─────────────────────────────────────────────
router.get('/', ctrl.getNgos);

// ── FIX: /apply MUST come before /:id ────────────────────────
// If /:id is registered first, Express treats "apply" as an ID
// and the route never reaches applyToNgo — returns 404.
router.post('/apply', auth, ctrl.applyToNgo);

// ── Auth routes ───────────────────────────────────────────────
router.post('/', auth, ctrl.createNgo);

// ── Dynamic :id routes (MUST come after static routes) ───────
router.get('/:id', ctrl.getNgo);
router.get('/:id/applications', auth, ctrl.getNgoApplications);

module.exports = router;
