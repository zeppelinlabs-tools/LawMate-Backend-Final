/**
 * Payment Service — Safepay integration, shared by every payable flow.
 *
 * Originally this Safepay logic lived only inside engagementController.js
 * for the chat "chit" flow. The Bill system (routes/bills.js) had its own,
 * completely separate "pay" endpoint that just set status='paid' with no
 * gateway involved at all — the client was self-confirming their own
 * payment. Extracting the real integration here means both flows go
 * through the identical, real gateway code, and there's exactly one place
 * that ever talks to Safepay.
 *
 * order_id sent to Safepay is prefixed with the reference type
 * ('bill_<id>' or 'engagement_<id>') so the webhook can unambiguously
 * dispatch to the right handler without guessing which collection an ID
 * belongs to.
 */

const crypto = require('crypto');

function safepayBaseUrl() {
    return process.env.SAFEPAY_ENV === 'production'
        ? 'https://api.getsafepay.com'
        : 'https://sandbox.api.getsafepay.com';
}

function isConfigured() {
    return !!process.env.SAFEPAY_SECRET_KEY && !!process.env.SAFEPAY_PUBLIC_KEY;
}

/**
 * Creates a Safepay payment tracker and returns a hosted checkout URL.
 * @param {Object} opts
 * @param {'bill'|'engagement'} opts.referenceType
 * @param {string} opts.referenceId - Mongo _id of the Bill or CaseEngagement
 * @param {number} opts.amount - PKR, whole rupees (not paisa)
 * @returns {Promise<{tracker: string, checkoutUrl: string}>}
 */
async function createCheckoutSession({ referenceType, referenceId, amount }) {
    if (!isConfigured()) {
        const err = new Error('Safepay is not configured. Add SAFEPAY_SECRET_KEY to your .env file.');
        err.code = 'SAFEPAY_NOT_CONFIGURED';
        throw err;
    }

    const axios = require('axios');
    const base  = safepayBaseUrl();
    const orderId = `${referenceType}_${referenceId}`;

    const trackerResponse = await axios.post(
        `${base}/order/v1/init`,
        {
            client:      process.env.SAFEPAY_PUBLIC_KEY,
            environment: process.env.SAFEPAY_ENV === 'production' ? 'production' : 'sandbox',
            currency: 'PKR',
            amount:   Math.round(amount * 100), // Safepay uses paisa (smallest unit)
            order_id: orderId,
            source:   'mobile',
        },
        {
            headers: {
                'Content-Type': 'application/json',
                'X-SFPY-MERCHANT-SECRET': process.env.SAFEPAY_SECRET_KEY,
            },
        }
    );

    // Safepay's response nests the actual session object under `data`, and
    // the session identifier field is called `token` (confusingly similar
    // to, but not the same as, the word "tracker" used elsewhere in their
    // docs/URLs) — reading `.tracker` here was silently treating every
    // successful response as a failure, even though Safepay had already
    // created a valid session.
    const tracker = trackerResponse.data?.data?.token;
    if (!tracker) {
        console.error('[paymentService] Safepay tracker creation failed:', trackerResponse.data);
        const err = new Error('Failed to create Safepay payment session');
        err.code = 'SAFEPAY_TRACKER_FAILED';
        throw err;
    }

    // Verified against Safepay's own official SDK source (@sfpy/node-sdk,
    // dist/utils/builder.js + dist/resources/checkout.js) rather than
    // guessed from blog posts — the real checkout path is
    // /checkout/pay (production checkout is served from getsafepay.com,
    // NOT api.getsafepay.com, unlike every other endpoint). cancel_url and
    // redirect_url must be real strings, not left undefined — passing
    // "undefined" as a literal query value was silently causing Safepay's
    // checkout to bail out and fall back to their marketing site, which is
    // exactly the "Contact Support / Innovation / Resources" page that was
    // showing up instead of a payment form. Since this only ever renders
    // inside our own in-app WebView (never an external browser the user
    // could actually land on), these URLs are never really navigated to —
    // completion is detected via the "I've Completed Payment" button plus
    // the webhook, not by watching for a redirect.
    const checkoutBase = process.env.SAFEPAY_ENV === 'production'
        ? 'https://getsafepay.com/checkout/pay'
        : 'https://sandbox.api.getsafepay.com/checkout/pay';

    // cancel_url/redirect_url previously pointed at a made-up placeholder
    // domain (lawmate.app) that doesn't exist and was never registered
    // with Safepay. Payment gateways commonly validate the redirect
    // domain against what's on file for the merchant account as an
    // anti-phishing measure — an unregistered or non-resolving domain is
    // a very plausible reason Safepay's checkout was silently falling
    // back to their own marketing site instead of rendering the payment
    // form. Using the real, already-deployed backend domain instead —
    // still never actually navigated to from inside the WebView (see note
    // above), but now at least a real, resolvable domain.
    const appOrigin = (process.env.APP_PUBLIC_URL || 'https://lawmate-backend-final-production.up.railway.app').replace(/\/$/, '');

    const checkoutParams = new URLSearchParams({
        beacon:       tracker,
        order_id:     orderId,
        env:          process.env.SAFEPAY_ENV === 'production' ? 'production' : 'sandbox',
        source:       'mobile',
        webhooks:     'true',
        cancel_url:   `${appOrigin}/api/payment-cancelled`,
        redirect_url: `${appOrigin}/api/payment-success`,
    });
    const checkoutUrl = `${checkoutBase}?${checkoutParams.toString()}`;

    return { tracker, checkoutUrl };
}

/**
 * Verifies a Safepay webhook's HMAC-SHA256 signature against the raw
 * request body. Must be called with the RAW (unparsed) body buffer —
 * signature verification breaks silently if the body has already been
 * JSON-parsed and re-stringified, since key order/whitespace can differ.
 */
function verifyWebhookSignature(rawBody, receivedSignature) {
    const webhookSecret = process.env.SAFEPAY_WEBHOOK_SECRET;
    if (!webhookSecret || !receivedSignature) return false;

    const expectedSig = crypto
        .createHmac('sha256', webhookSecret)
        .update(rawBody)
        .digest('hex');

    return receivedSignature === expectedSig;
}

/** Parses the 'bill_<id>' / 'engagement_<id>' order_id back into its parts. */
function parseOrderId(orderId) {
    if (!orderId) return null;
    const idx = orderId.indexOf('_');
    if (idx === -1) return null;
    return {
        referenceType: orderId.slice(0, idx),
        referenceId:   orderId.slice(idx + 1),
    };
}

/** 15% platform / 85% lawyer, or 5% platform / 95% social worker. */
function calculateSplit(totalAmount, professionalRole) {
    if (professionalRole === 'lawyer') {
        return {
            platformCommission: parseFloat((totalAmount * 0.15).toFixed(2)),
            professionalShare:  parseFloat((totalAmount * 0.85).toFixed(2)),
        };
    }
    if (professionalRole === 'social_worker') {
        return {
            platformCommission: parseFloat((totalAmount * 0.05).toFixed(2)),
            professionalShare:  parseFloat((totalAmount * 0.95).toFixed(2)),
        };
    }
    return { platformCommission: 0, professionalShare: totalAmount };
}

module.exports = {
    isConfigured,
    createCheckoutSession,
    verifyWebhookSignature,
    parseOrderId,
    calculateSplit,
};
