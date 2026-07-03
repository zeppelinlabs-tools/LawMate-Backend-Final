const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/documentController');
const auth = require('../middleware/authMiddleware');

// My Documents — list and create
router.get('/',              auth, ctrl.getMyDocuments);
router.post('/save',         auth, ctrl.saveDocument);

// Legacy generate endpoint kept for backward compatibility
router.post('/generate',     auth, ctrl.generateDocument);

// Single document operations
router.get('/:id',           auth, ctrl.getDocumentById);
router.put('/:id/sign',      auth, ctrl.signDocument);
router.delete('/:id',        auth, ctrl.deleteDocument);

module.exports = router;
