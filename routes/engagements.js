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
const CaseEngagement = require('../models/CaseEngagement');
const Notification   = require('../models/Notification');

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
// uploadSingleAttachment (multer) MUST run before blockUnverifiedProfessional
// — multer is what actually parses a multipart/form-data body into
// req.body in the first place. With the old order, any connection
// request that included an attachment hit blockUnverifiedProfessional
// with req.body still completely unparsed, silently skipping the
// verification check rather than properly evaluating it.
router.post('/request',            auth, uploadSingleAttachment, blockUnverifiedProfessional, ctrl.requestEngagement);

// All other engagement routes
router.post('/respond',            auth, ctrl.respondEngagement);
router.post('/send-chit',          auth, ctrl.sendChit);
router.post('/initialize-payment', auth, ctrl.initializePayment);
router.post('/process-payment',    auth, ctrl.processPayment);
router.post('/complete',           auth, ctrl.completeEngagement);
router.get ('/',                   auth, ctrl.getMyEngagements);
// Toggle call access. Either side (the professional OR the client) can
// Call access toggle — ONLY the professional (lawyer/social worker) controls
// this. Client has no toggle. Lawyer ON = client gets access to call.
// Lawyer OFF = client loses access. clientCallEnabled mirrors professionalCallEnabled.
// The lawyer can only call when they themselves have enabled it (they can't
// leave it off and still call — that damages the logic of access control).
router.put('/toggle-call/:engagementId', auth, async (req, res) => {
    try {
        const eng = await CaseEngagement.findById(req.params.engagementId);
        if (!eng) return res.status(404).json({ msg: 'Not found' });

        const viewerId = req.user.id.toString();
        const isProfessional =
            eng.lawyerId?.toString() === viewerId ||
            eng.socialWorkerId?.toString() === viewerId;

        if (!isProfessional) {
            return res.status(403).json({
                msg: 'Only the lawyer or social worker can toggle call access.'
            });
        }

        // Lawyer flips their access — client access mirrors it automatically.
        eng.professionalCallEnabled = !eng.professionalCallEnabled;
        eng.clientCallEnabled       = eng.professionalCallEnabled;
        eng.callEnabled             = eng.professionalCallEnabled;
        await eng.save();

        // Notify client about the change
        const accessMsg = eng.professionalCallEnabled
            ? 'Your lawyer has enabled call access. You can now make audio and video calls.'
            : 'Your lawyer has disabled call access.';
        await Notification.create({
            userId:  eng.clientId,
            type:    'general',
            title:   eng.professionalCallEnabled ? '📞 Call Access Enabled' : '📵 Call Access Disabled',
            message: accessMsg,
            isRead:  false
        });

        res.json({
            success:                 true,
            professionalCallEnabled: eng.professionalCallEnabled,
            clientCallEnabled:       eng.clientCallEnabled,
            callEnabled:             eng.callEnabled,
        });
    } catch (err) {
        console.error('[Engagements TOGGLE CALL]', err.message);
        res.status(500).json({ msg: 'Server error' });
    }
});

module.exports = router;
