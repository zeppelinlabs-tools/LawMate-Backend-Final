/**
 * Legal Cases Routes
 * 
 * All routes require JWT authentication.
 * 
 * GET    /api/legal-cases              → Get all cases (role-based)
 * POST   /api/legal-cases              → Create new case (lawyer only)
 * GET    /api/legal-cases/:id          → Get single case with timeline + vault
 * PUT    /api/legal-cases/:id          → Update case (lawyer who created it)
 * DELETE /api/legal-cases/:id          → Delete case + all timeline/vault entries
 * POST   /api/legal-cases/:id/timeline → Add hearing/timeline entry
 * POST   /api/legal-cases/:id/vault    → Add vault document to case
 */

const express = require('express');
const router  = express.Router();
const auth    = require('../middleware/authMiddleware');
const ctrl    = require('../controllers/legalCasesController');

router.get   ('/',               auth, ctrl.getCases);
router.post  ('/',               auth, ctrl.createCase);
router.get   ('/:id',            auth, ctrl.getCase);
router.put   ('/:id',            auth, ctrl.updateCase);
router.delete('/:id',            auth, ctrl.deleteCase);
router.post  ('/:id/timeline',   auth, ctrl.addTimelineEntry);
router.post  ('/:id/vault',      auth, ctrl.addVaultDocument);
router.post  ('/:id/share',      auth, ctrl.shareCase);
router.delete('/:id/share',      auth, ctrl.unshareCase);

module.exports = router;
