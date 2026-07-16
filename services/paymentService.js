const crypto = require('crypto');

function safepayBaseUrl() {
    return process.env.SAFEPAY_ENV === 'production'
        ? 'https://api.getsafepay.com'
        : 'https://sandbox.api.getsafepay.com';
}

function isConfigured() {
    return !!process.env.SAFEPAY_SECRET_KEY && !!process.env.SAFEPAY_PUBLIC_KEY;
}

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
            amount:   Math.round(amount * 100),
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

    const tracker = trackerResponse.data?.data?.token;
    if (!tracker) {
        console.error('[paymentService] Safepay tracker creation failed:', trackerResponse.data);
        const err = new Error('Failed to create Safepay payment session');
        err.code = 'SAFEPAY_TRACKER_FAILED';
        throw err;
    }

    const checkoutUrl = `${base}/components?beacon=${tracker}&order_id=${orderId}&source=mobile&env=${process.env.SAFEPAY_ENV || 'sandbox'}`;

    return { tracker, checkoutUrl };
}

function verifyWebhookSignature(rawBody, receivedSignature) {
    const webhookSecret = process.env.SAFEPAY_WEBHOOK_SECRET;
    if (!webhookSecret || !receivedSignature) return false;

    const expectedSig = crypto
        .createHmac('sha256', webhookSecret)
        .update(rawBody)
        .digest('hex');

    return receivedSignature === expectedSig;
}

function parseOrderId(orderId) {
    if (!orderId) return null;
    const idx = orderId.indexOf('_');
    if (idx === -1) return null;
    return {
        referenceType: orderId.slice(0, idx),
        referenceId:   orderId.slice(idx + 1),
    };
}

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
