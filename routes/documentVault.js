/**
 * Document Vault Routes
 * The shared "Documents Room" between a specific client and professional.
 *
 * GET    /api/document-vault/:engagementId           → list files
 * POST   /api/document-vault/:engagementId           → upload one file
 * DELETE /api/document-vault/:engagementId/:fileId   → delete one file
 */

const express = require('express');
const router  = express.Router();
const auth    = require('../middleware/authMiddleware');
const ctrl    = require('../controllers/documentVaultController');

let uploadVaultFile = (req, res, next) => next();
try {
    uploadVaultFile = require('../middleware/uploadMiddleware').uploadVaultFile;
} catch (e) {
    console.error('[Document Vault Routes] uploadMiddleware import skipped:', e.message);
}

router.get('/:engagementId',           auth, ctrl.listVaultFiles);
router.post('/:engagementId',          auth, uploadVaultFile, ctrl.uploadVaultFile);
router.delete('/:engagementId/:fileId', auth, ctrl.deleteVaultFile);

module.exports = router;
