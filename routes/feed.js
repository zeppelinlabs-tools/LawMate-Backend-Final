const express = require('express');
const router = express.Router();
const feedController = require('../controllers/feedController');
const auth = require('../middleware/authMiddleware');

// Specific-path GET routes registered before the main collection route so
// Express never mistakes 'saved'/'liked'/'commented' for a generic :id.
router.get('/saved',             auth, feedController.getSavedPosts);
router.get('/liked',             auth, feedController.getLikedPosts);
router.get('/commented',         auth, feedController.getCommentedPosts);
router.get('/user/:userId',            feedController.getUserPosts);

router.get('/', feedController.getPosts);
router.post('/', auth, feedController.createPost);
router.post('/:id/like', auth, feedController.likePost);
router.post('/:id/save',     auth, feedController.toggleSavePost);
router.post('/:id/comments', auth, feedController.addComment);

router.post('/follow/:userId',   auth, feedController.followUser);
router.delete('/follow/:userId', auth, feedController.unfollowUser);
router.get('/following',         auth, feedController.getFollowing);

module.exports = router;
