const express = require('express');
const router = express.Router();
const feedController = require('../controllers/feedController');
const auth = require('../middleware/authMiddleware');

// Safely require the feed media upload middleware — degrades to a
// no-op passthrough if missing, matching the pattern used elsewhere
// in this codebase (routes/auth.js, routes/engagements.js), so the
// rest of the feed still works even if this middleware were broken.
let uploadFeedMedia = (req, res, next) => next();
try {
    uploadFeedMedia = require('../middleware/uploadMiddleware').uploadFeedMedia;
} catch (e) {
    console.error('[Feed Routes] uploadMiddleware import skipped:', e.message);
}

// Specific-path GET routes registered before the main collection route so
// Express never mistakes 'saved'/'liked'/'commented' for a generic :id.
router.get('/saved',             auth, feedController.getSavedPosts);
router.get('/liked',             auth, feedController.getLikedPosts);
router.get('/commented',         auth, feedController.getCommentedPosts);
router.get('/user/:userId',            feedController.getUserPosts);
router.get('/profile-stats/:userId',   feedController.getProfileStats);

router.get('/', feedController.getPosts);
router.post('/upload-media', auth, uploadFeedMedia, feedController.uploadPostMedia);
router.post('/', auth, feedController.createPost);
router.post('/:id/like', auth, feedController.likePost);
router.post('/:id/save',     auth, feedController.toggleSavePost);
router.post('/:id/comments', auth, feedController.addComment);

router.post('/follow/:userId',   auth, feedController.followUser);
router.delete('/follow/:userId', auth, feedController.unfollowUser);
router.get('/following',         auth, feedController.getFollowing);

module.exports = router;
