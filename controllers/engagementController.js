/**
 * Engagement Controller
 * Handles: request, respond, send-chit, process-payment, complete
 */

const crypto          = require('crypto');
const CaseEngagement  = require('../models/CaseEngagement');
const ChatMessage     = require('../models/ChatMessage');
const Notification    = require('../models/Notification');
const User            = require('../models/User');

// ── Internal helper: save a notification to DB ────────────────
async function saveNotification(userId, message) {
    try {
        await Notification.create({ userId, message });
    } catch (e) {
        console.error('[Notification] Failed to save:', e.message);
    }
}

// ── Internal helper: get professionalId from engagement ───────
function getProfessionalId(engagement) {
    return engagement.lawyerId || engagement.socialWorkerId || null;
}

// ─────────────────────────────────────────────────────────────
// A. POST /api/engagements/request
// Client initiates a connection request to a professional.
// ─────────────────────────────────────────────────────────────
exports.requestEngagement = async (req, res) => {
    try {
        const { professionalId, initialMessage } = req.body;
        const clientId = req.user.id;

        if (!professionalId) {
            return res.status(400).json({ msg: 'professionalId is required' });
        }

        // Load professional to determine their role
        const professional = await User.findById(professionalId);
        if (!professional) {
            return res.status(404).json({ msg: 'Professional not found' });
        }
        if (!['lawyer', 'social_worker'].includes(professional.role)) {
            return res.status(400).json({ msg: 'Target user is not a lawyer or social worker' });
        }

        // Prevent duplicate active engagements
        const isLawyer       = professional.role === 'lawyer';
        const duplicateQuery = {
            clientId,
            status: { $nin: ['COMPLETED', 'DISPUTED'] },
            ...(isLawyer
                ? { lawyerId: professionalId }
                : { socialWorkerId: professionalId })
        };

        const existing = await CaseEngagement.findOne(duplicateQuery);
        if (existing) {
            return res.status(409).json({
                msg: 'An active engagement already exists with this professional.',
                engagementId: existing._id
            });
        }

        // Create engagement
        const engagementData = {
            clientId,
            status: 'REQUESTING',
            ...(isLawyer
                ? { lawyerId: professionalId }
                : { socialWorkerId: professionalId })
        };

        const engagement = new CaseEngagement(engagementData);
        await engagement.save();

        // Save initial message into chat history if provided
        if (initialMessage && initialMessage.trim()) {
            await ChatMessage.create({
                senderId:   clientId,
                receiverId: professionalId,
                message:    initialMessage.trim()
            });
        }

        // Notify the professional
        await Notification.create({ userId: professionalId, type: 'connection', title: 'New Connection Request', message: `A client wants to connect with you.`, actionId: engagement._id.toString(), isRead: false });

        res.status(201).json({
            success: true,
            msg:     'Engagement request sent successfully.',
            engagement
        });

    } catch (err) {
        console.error('[requestEngagement]', err.message);
        res.status(500).json({ msg: 'Server error', error: err.message });
    }
};

// ─────────────────────────────────────────────────────────────
// B. POST /api/engagements/respond
// Professional accepts or declines a request.
// Body: { engagementId, accept: true/false }
// ─────────────────────────────────────────────────────────────
exports.respondEngagement = async (req, res) => {
    try {
        const { engagementId, accept } = req.body;
        const professionalId = req.user.id;

        if (!engagementId) {
            return res.status(400).json({ msg: 'engagementId is required' });
        }

        const engagement = await CaseEngagement.findById(engagementId);
        if (!engagement) {
            return res.status(404).json({ msg: 'Engagement not found' });
        }

        // Verify the responder is the connected professional
        const profId = getProfessionalId(engagement);
        if (!profId || profId.toString() !== professionalId.toString()) {
            return res.status(403).json({ msg: 'Not authorized to respond to this engagement' });
        }

        if (engagement.status !== 'REQUESTING') {
            return res.status(400).json({ msg: `Cannot respond — current status is ${engagement.status}` });
        }

        if (accept) {
            // Accept → unlock chat pipeline
            engagement.status = 'FREE_INTAKE';
            await engagement.save();

            await Notification.create({ userId: engagement.clientId, type: 'connection', title: 'Request Accepted!', message: 'Your connection request has been accepted. You can now chat.', isRead: false });

            return res.json({
                success: true,
                msg:     'Engagement accepted. Chat is now unlocked.',
                engagement
            });

        } else {
            // Decline → mark as DISPUTED
            engagement.status = 'DISPUTED';
            await engagement.save();

            await saveNotification(
                engagement.clientId,
                'Your connection request was declined by the professional.'
            );

            return res.json({
                success: true,
                msg:     'Engagement declined.',
                engagement
            });
        }

    } catch (err) {
        console.error('[respondEngagement]', err.message);
        res.status(500).json({ msg: 'Server error', error: err.message });
    }
};

// ─────────────────────────────────────────────────────────────
// C. POST /api/engagements/send-chit
// Professional sends a digital invoice (chit) to the client.
// Body: { engagementId, engagementType, totalAmount, appointmentTime? }
// ─────────────────────────────────────────────────────────────
exports.sendChit = async (req, res) => {
    try {
        const { engagementId, engagementType, totalAmount, appointmentTime } = req.body;
        const professionalId = req.user.id;

        if (!engagementId) {
            return res.status(400).json({ msg: 'engagementId is required' });
        }

        const engagement = await CaseEngagement.findById(engagementId);
        if (!engagement) {
            return res.status(404).json({ msg: 'Engagement not found' });
        }

        // Only the connected professional can send a chit
        const profId = getProfessionalId(engagement);
        if (!profId || profId.toString() !== professionalId.toString()) {
            return res.status(403).json({ msg: 'Not authorized to send chit for this engagement' });
        }

        if (engagement.status !== 'FREE_INTAKE') {
            return res.status(400).json({ msg: `Cannot send chit — current status is ${engagement.status}` });
        }

        // Load professional to determine commission split
        const professional = await User.findById(professionalId);
        const amount       = Number(totalAmount) || 0;

        // ── Commission split logic ────────────────────────────
        let platformCommission = 0;
        let professionalShare  = 0;
        let isFreeService      = false;
        let paymentStatus      = 'UNPAID';

        if (amount === 0) {
            // Free service — bypass payment
            isFreeService  = true;
            paymentStatus  = 'BYPASSED';
        } else if (professional.role === 'lawyer') {
            platformCommission = parseFloat((amount * 0.15).toFixed(2));
            professionalShare  = parseFloat((amount * 0.85).toFixed(2));
        } else if (professional.role === 'social_worker') {
            platformCommission = parseFloat((amount * 0.05).toFixed(2));
            professionalShare  = parseFloat((amount * 0.95).toFixed(2));
        }

        // Apply to engagement
        engagement.status         = 'PROPOSAL_SENT';
        engagement.engagementType = engagementType || 'NONE';
        engagement.isFreeService  = isFreeService;

        engagement.financials = {
            totalAmount:        amount,
            platformCommission,
            professionalShare,
            paymentStatus
        };

        if (appointmentTime) {
            engagement.schedule.appointmentTime = new Date(appointmentTime);
        }

        await engagement.save();

        // Notify client
        await saveNotification(
            engagement.clientId,
            `Your professional has sent you a chit (invoice). Amount: PKR ${amount}. Please review and confirm.`
        );

        res.json({
            success: true,
            msg:     'Chit sent successfully.',
            engagement
        });

    } catch (err) {
        console.error('[sendChit]', err.message);
        res.status(500).json({ msg: 'Server error', error: err.message });
    }
};

// ─────────────────────────────────────────────────────────────
// D. POST /api/engagements/process-payment
// Client pays or confirms a free chit.
// Body: { engagementId, paymentPayload? }
// ─────────────────────────────────────────────────────────────
exports.processPayment = async (req, res) => {
    try {
        const { engagementId, paymentPayload } = req.body;
        const clientId = req.user.id;

        if (!engagementId) {
            return res.status(400).json({ msg: 'engagementId is required' });
        }

        const engagement = await CaseEngagement.findById(engagementId);
        if (!engagement) {
            return res.status(404).json({ msg: 'Engagement not found' });
        }

        if (engagement.clientId.toString() !== clientId.toString()) {
            return res.status(403).json({ msg: 'Not authorized to process payment for this engagement' });
        }

        if (engagement.status !== 'PROPOSAL_SENT') {
            return res.status(400).json({ msg: `Cannot process payment — current status is ${engagement.status}` });
        }

        // Generate unique video room ID for virtual consultations
        const videoRoomId = crypto.randomBytes(16).toString('hex');
        engagement.schedule.videoRoomId = videoRoomId;

        if (engagement.isFreeService) {
            // Free — instantly lock without payment
            engagement.status = 'ESCROW_LOCKED';
            engagement.financials.paymentStatus = 'BYPASSED';

        } else {
            // Paid — in production replace this block with real payment gateway
            // e.g. JazzCash, Easypaisa, Stripe verification
            // For now: accept paymentPayload as verified
            if (!paymentPayload) {
                return res.status(400).json({ msg: 'paymentPayload is required for paid engagements' });
            }

            // TODO: verify paymentPayload with your payment gateway here
            // const verified = await paymentGateway.verify(paymentPayload);
            // if (!verified) return res.status(402).json({ msg: 'Payment verification failed' });

            engagement.status = 'ESCROW_LOCKED';
            engagement.financials.paymentStatus = 'HELD_IN_ESCROW';
        }

        await engagement.save();

        // Notify professional
        const profId = getProfessionalId(engagement);
        if (profId) {
            await saveNotification(
                profId,
                `Payment confirmed! Your session is locked and ready. Video Room ID: ${videoRoomId}`
            );
        }

        res.json({
            success:     true,
            msg:         'Payment processed. Engagement is now active.',
            videoRoomId,
            engagement
        });

    } catch (err) {
        console.error('[processPayment]', err.message);
        res.status(500).json({ msg: 'Server error', error: err.message });
    }
};

// ─────────────────────────────────────────────────────────────
// E. POST /api/engagements/complete
// Session closeout — marks engagement as completed.
// Body: { engagementId }
// ─────────────────────────────────────────────────────────────
exports.completeEngagement = async (req, res) => {
    try {
        const { engagementId } = req.body;
        const userId = req.user.id;

        if (!engagementId) {
            return res.status(400).json({ msg: 'engagementId is required' });
        }

        const engagement = await CaseEngagement.findById(engagementId);
        if (!engagement) {
            return res.status(404).json({ msg: 'Engagement not found' });
        }

        // Allow either client or professional to mark complete
        const profId   = getProfessionalId(engagement);
        const isClient = engagement.clientId.toString() === userId.toString();
        const isProf   = profId && profId.toString() === userId.toString();

        if (!isClient && !isProf) {
            return res.status(403).json({ msg: 'Not authorized to complete this engagement' });
        }

        if (engagement.status !== 'ESCROW_LOCKED') {
            return res.status(400).json({ msg: `Cannot complete — current status is ${engagement.status}` });
        }

        engagement.status = 'COMPLETED';

        // Release payment to professional's withdrawable balance
        if (!engagement.isFreeService && engagement.financials.professionalShare > 0) {
            engagement.financials.paymentStatus = 'RELEASED';

            if (profId) {
                await User.findByIdAndUpdate(profId, {
                    $inc: { withdrawableBalance: engagement.financials.professionalShare }
                });
            }
        }

        await engagement.save();

        // Notify both parties
        await saveNotification(
            engagement.clientId,
            'Your session has been marked as completed. Thank you for using LawMate!'
        );
        if (profId) {
            await saveNotification(
                profId,
                `Session completed. PKR ${engagement.financials.professionalShare} has been added to your withdrawable balance.`
            );
        }

        res.json({
            success: true,
            msg:     'Engagement completed successfully.',
            engagement
        });

    } catch (err) {
        console.error('[completeEngagement]', err.message);
        res.status(500).json({ msg: 'Server error', error: err.message });
    }
};

// ─────────────────────────────────────────────────────────────
// GET /api/engagements
// Get all engagements for the logged in user (client or professional)
// ─────────────────────────────────────────────────────────────
exports.getMyEngagements = async (req, res) => {
    try {
        const userId = req.user.id;
        const user   = await User.findById(userId);
        if (!user) return res.status(404).json({ msg: 'User not found' });

        let query = {};
        if (user.role === 'lawyer') {
            query = { lawyerId: userId };
        } else if (user.role === 'social_worker') {
            query = { socialWorkerId: userId };
        } else {
            query = { clientId: userId };
        }

        const engagements = await CaseEngagement.find(query)
            .populate('clientId',       'name firstName lastName profilePic')
            .populate('lawyerId',       'name firstName lastName profilePic')
            .populate('socialWorkerId', 'name firstName lastName profilePic')
            .sort({ createdAt: -1 });

        res.json({ success: true, engagements });

    } catch (err) {
        console.error('[getMyEngagements]', err.message);
        res.status(500).json({ msg: 'Server error', error: err.message });
    }
};



// ─────────────────────────────────────────────────────────────
// F. POST /api/engagements/initialize-payment
//
// Called by client after receiving the chit.
// PATH A — totalAmount === 0 → free, bypass Safepay entirely.
// PATH B — totalAmount  > 0  → create Safepay payment session,
//           return payment URL to the mobile app.
//
// Body: { engagementId }
// ─────────────────────────────────────────────────────────────
exports.initializePayment = async (req, res) => {
    try {
        const { engagementId } = req.body;
        const clientId         = req.user.id;

        if (!engagementId) {
            return res.status(400).json({ msg: 'engagementId is required' });
        }

        // ── Load engagement ───────────────────────────────────
        const engagement = await CaseEngagement.findById(engagementId);
        if (!engagement) {
            return res.status(404).json({ msg: 'Engagement not found' });
        }

        // Only the client on this engagement can initialize payment
        if (engagement.clientId.toString() !== clientId.toString()) {
            return res.status(403).json({ msg: 'Not authorized to initialize payment for this engagement' });
        }

        if (engagement.status !== 'PROPOSAL_SENT') {
            return res.status(400).json({
                msg: `Cannot initialize payment — current status is ${engagement.status}`
            });
        }

        const totalAmount = engagement.financials.totalAmount;

        // ── PATH A: FREE — skip Safepay entirely ──────────────
        if (totalAmount === 0) {
            const videoRoomId = crypto.randomBytes(16).toString('hex');

            engagement.status                        = 'ESCROW_LOCKED';
            engagement.isFreeService                 = true;
            engagement.financials.paymentStatus      = 'BYPASSED';
            engagement.financials.platformCommission = 0;
            engagement.financials.professionalShare  = 0;
            engagement.schedule.videoRoomId          = videoRoomId;

            await engagement.save();

            // Notify professional
            const profId = getProfessionalId(engagement);
            if (profId) {
                await saveNotification(
                    profId,
                    `Free session confirmed! Video Room ID: ${videoRoomId}`
                );
            }

            return res.status(200).json({
                success:     true,
                isFree:      true,
                msg:         'Free engagement locked and ready.',
                videoRoomId,
                engagement
            });
        }

        // ── PATH B: PAID — create Safepay payment session ─────
        if (!process.env.SAFEPAY_SECRET_KEY) {
            return res.status(500).json({
                msg: 'Safepay is not configured. Add SAFEPAY_SECRET_KEY to your .env file.'
            });
        }

        const axios      = require('axios');
        const clientUser = await User.findById(clientId).select('email name phone');

        // Step 1: Create a Safepay tracker (payment session)
        // Safepay sandbox: https://sandbox.api.getsafepay.com
        // Safepay production: https://api.getsafepay.com
        const safepayBase = process.env.SAFEPAY_ENV === 'production'
            ? 'https://api.getsafepay.com'
            : 'https://sandbox.api.getsafepay.com';

        // Create payment tracker
        const trackerResponse = await axios.post(
            `${safepayBase}/order/v1/init`,
            {
                currency:   'PKR',
                amount:     Math.round(totalAmount * 100), // Safepay uses paisa (smallest unit)
                order_id:   engagement._id.toString(),
                source:     'mobile',
            },
            {
                headers: {
                    'Content-Type':  'application/json',
                    'X-SFPY-MERCHANT-SECRET': process.env.SAFEPAY_SECRET_KEY
                }
            }
        );

        const tracker = trackerResponse.data?.data?.tracker;

        if (!tracker) {
            console.error('[initializePayment] Safepay tracker creation failed:', trackerResponse.data);
            return res.status(502).json({ msg: 'Failed to create Safepay payment session' });
        }

        // Step 2: Build the hosted checkout URL for the Flutter WebView
        const safepayPublicKey = process.env.SAFEPAY_PUBLIC_KEY || '';
        const checkoutUrl = `${safepayBase}/embedded?beacon=${tracker}&order_id=${engagement._id}&env=${process.env.SAFEPAY_ENV || 'sandbox'}`;

        return res.status(200).json({
            success:      true,
            isFree:       false,
            tracker,
            checkoutUrl,
            amount:       totalAmount,
            currency:     'PKR',
            msg:          'Safepay session created. Open checkoutUrl in your Flutter WebView to complete payment.'
        });

    } catch (err) {
        // Surface Safepay API errors clearly
        if (err.response?.data) {
            console.error('[initializePayment] Safepay API error:', err.response.data);
            return res.status(502).json({
                msg:   'Safepay API error',
                error: err.response.data
            });
        }
        console.error('[initializePayment]', err.message);
        res.status(500).json({ msg: 'Server error', error: err.message });
    }
};

// ─────────────────────────────────────────────────────────────
// G. POST /api/engagements/webhook
//
// Safepay calls this endpoint automatically after payment.
// Safepay sends a signed payload — we verify using HMAC SHA256
// with your SAFEPAY_WEBHOOK_SECRET.
//
// On successful payment event:
//  1. Verify Safepay webhook signature
//  2. Extract engagementId (order_id) from payload
//  3. Look up professional type (lawyer vs social_worker)
//  4. Apply commission split
//  5. Lock engagement + generate videoRoomId
//  6. Notify both parties
// ─────────────────────────────────────────────────────────────
exports.safepayWebhook = async (req, res) => {
    try {
        const webhookSecret = process.env.SAFEPAY_WEBHOOK_SECRET;

        if (!webhookSecret) {
            console.error('[Webhook] SAFEPAY_WEBHOOK_SECRET not set in .env');
            return res.status(500).json({ msg: 'Webhook secret not configured' });
        }

        // ── Step 1: Verify Safepay webhook signature ──────────
        // Safepay sends signature in 'x-sfpy-signature' header
        // Signature = HMAC-SHA256(raw body, SAFEPAY_WEBHOOK_SECRET)
        const receivedSig  = req.headers['x-sfpy-signature'];
        const rawBody      = req.body; // raw Buffer from express.raw()

        if (!receivedSig) {
            console.error('[Webhook] Missing x-sfpy-signature header');
            return res.status(400).json({ msg: 'Missing webhook signature' });
        }

        const expectedSig = crypto
            .createHmac('sha256', webhookSecret)
            .update(rawBody)
            .digest('hex');

        if (receivedSig !== expectedSig) {
            console.error('[Webhook] Signature mismatch — possible fraudulent request');
            return res.status(400).json({ msg: 'Webhook signature verification failed' });
        }

        // ── Step 2: Parse the verified payload ────────────────
        let payload;
        try {
            payload = JSON.parse(rawBody.toString());
        } catch (e) {
            return res.status(400).json({ msg: 'Invalid JSON payload' });
        }

        // Only process successful payment events
        // Safepay event types: payment:created, payment:success, payment:failed
        const eventType = payload?.type || payload?.event;
        if (eventType !== 'payment:success' && eventType !== 'payment.success') {
            return res.status(200).json({ received: true, processed: false, event: eventType });
        }

        // Extract engagementId from order_id
        const engagementId = payload?.data?.order_id
            || payload?.payload?.order_id
            || payload?.order_id;

        if (!engagementId) {
            console.error('[Webhook] No order_id (engagementId) in Safepay payload');
            return res.status(400).json({ msg: 'order_id missing from webhook payload' });
        }

        // ── Step 3: Load engagement ───────────────────────────
        const engagement = await CaseEngagement.findById(engagementId);
        if (!engagement) {
            console.error('[Webhook] Engagement not found:', engagementId);
            return res.status(404).json({ msg: 'Engagement not found' });
        }

        // Prevent double-processing
        if (engagement.status === 'ESCROW_LOCKED' || engagement.status === 'COMPLETED') {
            return res.status(200).json({ received: true, msg: 'Already processed' });
        }

        // ── Step 4: Load professional + apply commission split ─
        const profId = getProfessionalId(engagement);
        if (!profId) {
            return res.status(400).json({ msg: 'No professional found on this engagement' });
        }

        const professional     = await User.findById(profId).select('role');
        const totalAmount      = engagement.financials.totalAmount;
        let platformCommission = 0;
        let professionalShare  = 0;

        if (professional.role === 'lawyer') {
            // Lawyer: 15% platform, 85% lawyer
            platformCommission = parseFloat((totalAmount * 0.15).toFixed(2));
            professionalShare  = parseFloat((totalAmount * 0.85).toFixed(2));
        } else if (professional.role === 'social_worker') {
            // Social Worker: 5% platform, 95% social worker
            platformCommission = parseFloat((totalAmount * 0.05).toFixed(2));
            professionalShare  = parseFloat((totalAmount * 0.95).toFixed(2));
        }

        // ── Step 5: Generate videoRoomId + update engagement ──
        const videoRoomId = crypto.randomBytes(16).toString('hex');

        engagement.status                        = 'ESCROW_LOCKED';
        engagement.financials.platformCommission = platformCommission;
        engagement.financials.professionalShare  = professionalShare;
        engagement.financials.paymentStatus      = 'HELD_IN_ESCROW';
        engagement.schedule.videoRoomId          = videoRoomId;

        await engagement.save();

        // ── Step 6: Notify both parties ───────────────────────
        await saveNotification(
            engagement.clientId,
            `Payment received! Your session is confirmed. Video Room ID: ${videoRoomId}`
        );
        await saveNotification(
            profId,
            `Payment received from client. Session locked. Video Room ID: ${videoRoomId}. Your share: PKR ${professionalShare}`
        );

        console.log(`[Webhook] Safepay payment processed for engagement ${engagementId}. Room: ${videoRoomId}`);

        return res.status(200).json({ received: true, processed: true });

    } catch (err) {
        console.error('[Webhook] Processing error:', err.message);
        return res.status(500).json({ msg: 'Server error processing webhook', error: err.message });
    }
};
