/**
 * Engagement Routes
 * All routes except /webhook require JWT authentication.
 *
 * POST /api/engagements/request             → Client initiates connection
 * POST /api/engagements/respond             → Professional accepts/declines
 * POST /api/engagements/send-chit           → Professional sends invoice
 * POST /api/engagements/initialize-payment  → Client initializes payment
 * POST /api/engagements/process-payment     → Manual payment confirm (testing)
 * POST /api/engagements/complete            → Session closeout
 * POST /api/engagements/webhook             → Safepay webhook (raw body, no JWT)
 * GET  /api/engagements                     → Get my engagements
 */

const express  = require('express');
const router   = express.Router();
const auth     = require('../middleware/authMiddleware');
const { blockUnverifiedProfessional } = require('../middleware/verifiedOnly');
const ctrl     = require('../controllers/engagementController');

// Safely require the attachment upload middleware — degrades to a no-op
// passthrough if missing, matching the pattern used in routes/auth.js,
// so a connection request without an attachment still works even if
// this middleware were ever removed/broken.
let uploadSingleAttachment = (req, res, next) => next();
try {
    uploadSingleAttachment = require('../middleware/uploadMiddleware').uploadSingleAttachment;
} catch (e) {
    console.error('[Engagement Routes] uploadMiddleware import skipped:', e.message);
}

// Safepay webhook — raw body required
router.post('/webhook', express.raw({ type: 'application/json' }), ctrl.safepayWebhook);

// Engagement request — blocks unverified professionals. Multer's
// .single() only parses requests with Content-Type: multipart/form-data;
// a plain JSON request (no attachment) passes through untouched.
router.post('/request',            auth, blockUnverifiedProfessional, uploadSingleAttachment, ctrl.requestEngagement);

// All other engagement routes
router.post('/respond',            auth, ctrl.respondEngagement);
router.post('/send-chit',          auth, ctrl.sendChit);
router.post('/initialize-payment', auth, ctrl.initializePayment);
router.post('/process-payment',    auth, ctrl.processPayment);
router.post('/complete',           auth, ctrl.completeEngagement);
router.get ('/',                   auth, ctrl.getMyEngagements);
router.put('/toggle-call/:engagementId', auth, async (req, res) => {
    try {
        const eng = await CaseEngagement.findById(req.params.engagementId);
        if (!eng) return res.status(404).json({ msg: 'Not found' });
        eng.callEnabled = !eng.callEnabled;
        await eng.save();
        res.json({ success: true, callEnabled: eng.callEnabled });
    } catch (err) {
        res.status(500).json({ msg: 'Server error' });
    }
});

module.exports = router;
