const express        = require('express');
const router         = express.Router();
const authController = require('../controllers/authController');
const auth           = require('../middleware/authMiddleware');

router.post('/register',        authController.register);
router.post('/login',           authController.login);
router.post('/google-sync',     authController.googleSync);
router.post('/verify-otp',      authController.verifyOtp);
router.post('/resend-otp',      authController.resendOtp);
router.get ('/me',              auth, authController.me);
router.put ('/update-profile',  auth, authController.updateProfile);
router.put ('/profile',         auth, authController.updateProfile);
router.put('/change-password', auth, authController.changePassword);
router.post('/register/lawyer', authController.register);
router.post('/register/social-worker', authController.register);
router.post('/forgot-password',        authController.forgotPassword);
router.post('/reset-password',         authController.resetPassword);
router.get('/search-user', auth, authController.searchUser);
router.post('/bookmark/:lawId', auth, authController.toggleBookmark);
router.get('/bookmarks',        auth, authController.getBookmarks);

module.exports = router;
