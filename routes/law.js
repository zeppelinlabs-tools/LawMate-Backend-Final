const express = require('express');
const router = express.Router();
const lawController = require('../controllers/lawController');

router.get('/categories', lawController.getCategories);
router.get('/', lawController.getLaws);
router.get('/:id', lawController.getLawById);

module.exports = router;
