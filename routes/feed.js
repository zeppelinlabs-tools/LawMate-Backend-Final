const express = require('express');
const router = express.Router();
const feedController = require('../controllers/feedController');
const auth = require('../middleware/authMiddleware');

router.get('/', feedController.getPosts);
router.post('/', auth, feedController.createPost);
router.post('/:id/like', auth, feedController.likePost);

module.exports = router;
