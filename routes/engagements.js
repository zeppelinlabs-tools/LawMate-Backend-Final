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

// Safepay webhook — raw body required
router.post('/webhook', express.raw({ type: 'application/json' }), ctrl.safepayWebhook);

// Engagement request — blocks unverified professionals
router.post('/request',            auth, blockUnverifiedProfessional, ctrl.requestEngagement);

// All other engagement routes
router.post('/respond',            auth, ctrl.respondEngagement);
router.post('/send-chit',          auth, ctrl.sendChit);
router.post('/initialize-payment', auth, ctrl.initializePayment);
router.post('/process-payment',    auth, ctrl.processPayment);
router.post('/complete',           auth, ctrl.completeEngagement);
router.get ('/',                   auth, ctrl.getMyEngagements);

module.exports = router;
