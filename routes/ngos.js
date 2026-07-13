/**
 * NGO Routes
 *
 * GET    /api/ngos                           → List all active NGOs (public)
 * GET    /api/ngos/my                        → Get own NGO profile (social_worker)
 * PUT    /api/ngos/my                        → Update own NGO profile (social_worker)
 * GET    /api/ngos/applications/mine         → Client: see own applications
 * GET    /api/ngos/applications/incoming     → NGO: see incoming applications
 * PUT    /api/ngos/applications/:id/advance  → NGO: pending -> under_review -> inquiry
 * PUT    /api/ngos/applications/:id/respond  → NGO: accept or reject
 * GET    /api/ngos/case-tracking/:appId      → Get case tracking for an application
 * PUT    /api/ngos/case-tracking/:id/milestone → Update a milestone
 * PUT    /api/ngos/case-tracking/:id/status  → Update case status
 * GET    /api/ngos/case-tracking/:applicationId/documents            → List Shared Vault files
 * POST   /api/ngos/case-tracking/:applicationId/documents            → Upload a Shared Vault file
 * DELETE /api/ngos/case-tracking/:applicationId/documents/:fileId    → Delete own Shared Vault file
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

let uploadVaultFile = (req, res, next) => next();
try {
    uploadVaultFile = require('../middleware/uploadMiddleware').uploadVaultFile;
} catch (e) {
    console.error('[NGO Routes] uploadMiddleware import skipped:', e.message);
}

// ── Public ────────────────────────────────────────────────────────────────────
router.get('/', ctrl.getNgos);

// ── Static routes BEFORE /:id ─────────────────────────────────────────────────
router.get('/my',                          auth, ctrl.getMyNgo);
router.put('/my',                          auth, ctrl.updateMyNgo);
router.get('/applications/mine',           auth, ctrl.getMyApplications);
router.get('/applications/incoming',       auth, ctrl.getIncomingApplications);
router.put('/applications/:id/advance',    auth, ctrl.advanceApplicationStatus);
router.put('/applications/:id/respond',    auth, ctrl.respondToApplication);
router.get('/case-tracking/:applicationId',auth, ctrl.getCaseTracking);
router.put('/case-tracking/:id/milestone', auth, ctrl.updateMilestone);
router.put('/case-tracking/:id/status',    auth, ctrl.updateCaseStatus);

// Shared Vault (Case Workspace Tab 2). These have one more path segment
// than /case-tracking/:applicationId above, so they don't collide with
// it regardless of order — Express only matches on exact segment shape.
router.get   ('/case-tracking/:applicationId/documents',          auth, ctrl.listCaseDocuments);
router.post  ('/case-tracking/:applicationId/documents',          auth, uploadVaultFile, ctrl.uploadCaseDocument);
router.delete('/case-tracking/:applicationId/documents/:fileId',  auth, ctrl.deleteCaseDocument);

router.post('/apply',                      auth, ctrl.applyToNgo);
router.post('/',                           auth, ctrl.createNgo);

// Admin verify
router.post('/admin/:id/verify', ctrl.verifyNgo);

// ── Dynamic /:id routes LAST ───────────────────────────────────────────────────
router.get('/:id',               ctrl.getNgo);
router.get('/:id/applications',  auth, ctrl.getNgoApplications);

module.exports = router;
