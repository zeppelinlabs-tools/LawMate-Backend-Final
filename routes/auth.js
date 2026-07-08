const express        = require('express');
const router         = express.Router();
const authController = require('../controllers/authController');
const auth           = require('../middleware/authMiddleware');

// Safely require the upload middleware — wrapped so a missing/broken
// middleware file degrades to "no file uploads supported" rather than
// crashing every auth route (registration, login, etc all live in this file).
let uploadLawyerDocs = (req, res, next) => next();
let uploadSocialWorkerDocs = (req, res, next) => next();
try {
    const mw = require('../middleware/uploadMiddleware');
    uploadLawyerDocs = mw.uploadLawyerDocs;
    uploadSocialWorkerDocs = mw.uploadSocialWorkerDocs;
} catch (e) {
    console.error('[Auth Routes] uploadMiddleware import skipped:', e.message);
}

// Multer's .fields() middleware only parses requests with
// Content-Type: multipart/form-data — a plain JSON client/social-worker
// signup request passes straight through untouched, so attaching this
// here does not affect any non-lawyer registration flow.
router.post('/register',        uploadLawyerDocs, authController.register);
router.post('/login',           authController.login);
router.post('/google-sync',     authController.googleSync);
router.post('/verify-otp',      authController.verifyOtp);
router.post('/resend-otp',      authController.resendOtp);
router.get ('/me',              auth, authController.me);
router.put ('/update-profile',  auth, authController.updateProfile);
router.put ('/profile',         auth, authController.updateProfile);
router.put('/change-password', auth, authController.changePassword);
router.post('/register/lawyer', uploadLawyerDocs, authController.register);
router.post('/register/social-worker', uploadSocialWorkerDocs, authController.register);
router.post('/register/ngo',           uploadSocialWorkerDocs, authController.register); // NGO uses same docs
router.post('/forgot-password',        authController.forgotPassword);
router.post('/reset-password',         authController.resetPassword);
router.get('/search-user', auth, authController.searchUser);
router.post('/bookmark/:lawId', auth, authController.toggleBookmark);
router.get('/bookmarks',        auth, authController.getBookmarks);
router.delete('/delete-account', auth, authController.deleteAccount);

module.exports = router;
