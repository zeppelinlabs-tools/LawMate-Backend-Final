const express        = require('express');
const router         = express.Router();
const authController = require('../controllers/authController');
const auth           = require('../middleware/authMiddleware');
const { uploadLawyerDocs, uploadSocialWorkerDocs } = require('../middleware/uploadMiddleware');

// ── Public routes ─────────────────────────────────────────────

// Standard register (all roles) — works without file upload
router.post('/register',                                          authController.register);

// Role-specific register with file uploads
router.post('/register/lawyer',        uploadLawyerDocs,         authController.register);
router.post('/register/social-worker', uploadSocialWorkerDocs,   authController.register);

router.post('/login',         authController.login);
router.post('/google-sync',   authController.googleSync);
router.post('/verify-otp',    authController.verifyOtp);
router.post('/resend-otp',    authController.resendOtp);

// ── Protected routes ──────────────────────────────────────────
router.get ('/me',             auth, authController.me);
router.put ('/update-profile', auth, authController.updateProfile);
router.put ('/profile',        auth, authController.updateProfile); // alias for frontend

module.exports = router;
