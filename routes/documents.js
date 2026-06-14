const express = require('express');
const router = express.Router();
const documentController = require('../controllers/documentController');
const auth = require('../middleware/authMiddleware');

router.post('/generate', auth, documentController.generateDocument);

module.exports = router;
