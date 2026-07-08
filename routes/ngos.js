/**
 * NGO Routes
 *
 * GET    /api/ngos                           → List all active NGOs (public)
 * GET    /api/ngos/my                        → Get own NGO profile (social_worker)
 * PUT    /api/ngos/my                        → Update own NGO profile (social_worker)
 * GET    /api/ngos/applications/mine         → Client: see own applications
 * GET    /api/ngos/applications/incoming     → NGO: see incoming applications
 * PUT    /api/ngos/applications/:id/respond  → NGO: accept or reject
 * GET    /api/ngos/case-tracking/:appId      → Get case tracking for an application
 * PUT    /api/ngos/case-tracking/:id/milestone → Update a milestone
 * PUT    /api/ngos/case-tracking/:id/status  → Update case status
 * POST   /api/ngos/apply                     → Client: apply to NGO (auth)
 * POST   /api/ngos                           → Create NGO (auth)
 * POST   /api/ngos/admin/:id/verify          → Admin: verify NGO
 * GET    /api/ngos/:id                       → Get single NGO (public)
 * GET    /api/ngos/:id/applications          → Legacy: NGO gets own applications
 *
 * IMPORTANT: Static routes (my, apply, applications/mine, etc.) MUST come
 * before dynamic /:id routes so Express doesn't treat them as IDs.
 */

const express = require('express');
const router  = express.Router();
const auth    = require('../middleware/authMiddleware');
const ctrl    = require('../controllers/ngoController');

// ── Public ────────────────────────────────────────────────────────────────────
router.get('/', ctrl.getNgos);

// ── Static routes BEFORE /:id ─────────────────────────────────────────────────
router.get('/my',                          auth, ctrl.getMyNgo);
router.put('/my',                          auth, ctrl.updateMyNgo);
router.get('/applications/mine',           auth, ctrl.getMyApplications);
router.get('/applications/incoming',       auth, ctrl.getIncomingApplications);
router.put('/applications/:id/respond',    auth, ctrl.respondToApplication);
router.get('/case-tracking/:applicationId',auth, ctrl.getCaseTracking);
router.put('/case-tracking/:id/milestone', auth, ctrl.updateMilestone);
router.put('/case-tracking/:id/status',    auth, ctrl.updateCaseStatus);
router.post('/apply',                      auth, ctrl.applyToNgo);
router.post('/',                           auth, ctrl.createNgo);

// Admin verify
router.post('/admin/:id/verify', ctrl.verifyNgo);

// ── Dynamic /:id routes LAST ───────────────────────────────────────────────────
router.get('/:id',               ctrl.getNgo);
router.get('/:id/applications',  auth, ctrl.getNgoApplications);

module.exports = router;
