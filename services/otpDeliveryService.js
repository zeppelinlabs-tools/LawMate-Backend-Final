/**
 * OTP Delivery Service
 *
 * Sends real OTP codes via:
 *   - Email → Brevo (https://www.brevo.com) transactional email API
 *   - SMS   → Twilio (https://www.twilio.com) Programmable Messaging API
 *
 * Both use plain axios calls (already a dependency) rather than pulling
 * in either provider's full SDK — less to install, less that can break
 * on a fresh `npm install`, and the request shape for a single
 * transactional send is simple enough not to need a wrapper library.
 *
 * SAFE-BY-DEFAULT: if the relevant API key isn't set in .env yet, this
 * falls back to logging the OTP to the console (the same behavior the
 * app already had) instead of crashing the signup/login flow. That way
 * you can add real credentials whenever you're ready without anything
 * breaking in the meantime — register/login/forgot-password keep working
 * via the on-screen "Dev OTP" display until you do.
 */

const axios = require('axios');

const BREVO_API_URL  = 'https://api.brevo.com/v3/smtp/email';
const TWILIO_API_URL = (accountSid) =>
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;

// ── Email via Brevo ────────────────────────────────────────────
async function sendOtpEmail(toEmail, code) {
    const apiKey = process.env.BREVO_API_KEY;
    const fromEmail = process.env.BREVO_SENDER_EMAIL || 'no-reply@lawmate.app';
    const fromName  = process.env.BREVO_SENDER_NAME  || 'LawMate';

    if (!apiKey) {
        console.warn('[OTP Email] BREVO_API_KEY not set — falling back to console log.');
        console.log(`[OTP] (DEV) Email code for ${toEmail}: ${code}`);
        return { delivered: false, reason: 'not_configured' };
    }

    try {
        await axios.post(
            BREVO_API_URL,
            {
                sender:      { name: fromName, email: fromEmail },
                to:          [{ email: toEmail }],
                subject:     `Your LawMate verification code: ${code}`,
                htmlContent: `
                    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
                        <h2 style="color:#D4AF37; margin-bottom: 4px;">LawMate</h2>
                        <p style="color:#333; font-size: 15px;">Your verification code is:</p>
                        <div style="font-size: 32px; font-weight: 800; letter-spacing: 6px; color:#111; margin: 16px 0;">${code}</div>
                        <p style="color:#777; font-size: 13px;">This code expires in 15 minutes. If you didn't request this, you can safely ignore this email.</p>
                    </div>
                `,
            },
            {
                headers: {
                    'api-key':      apiKey,
                    'Content-Type': 'application/json',
                    'Accept':       'application/json',
                },
                timeout: 10000,
            }
        );
        return { delivered: true };
    } catch (err) {
        console.error('[OTP Email] Brevo send failed:', err.response?.data || err.message);
        return { delivered: false, reason: 'send_failed', error: err.response?.data || err.message };
    }
}

// ── SMS via Twilio ─────────────────────────────────────────────
async function sendOtpSms(toPhone, code) {
    const accountSid  = process.env.TWILIO_ACCOUNT_SID;
    const authToken    = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber    = process.env.TWILIO_PHONE_NUMBER;

    if (!accountSid || !authToken || !fromNumber) {
        console.warn('[OTP SMS] Twilio credentials not fully set — falling back to console log.');
        console.log(`[OTP] (DEV) SMS code for ${toPhone}: ${code}`);
        return { delivered: false, reason: 'not_configured' };
    }

    // Normalize to E.164. Pakistani numbers are commonly entered as
    // 03xxxxxxxxx (11 digits, leading 0) — Twilio needs +92xxxxxxxxxx.
    // If the number already starts with + we trust it as-is, since the
    // person may be registering with a non-Pakistani number too.
    let normalized = (toPhone || '').replace(/[\s-]/g, '');
    if (!normalized.startsWith('+')) {
        if (normalized.startsWith('0')) {
            normalized = `+92${normalized.slice(1)}`;
        } else if (normalized.startsWith('92')) {
            normalized = `+${normalized}`;
        } else {
            normalized = `+92${normalized}`;
        }
    }

    try {
        const params = new URLSearchParams();
        params.append('To', normalized);
        params.append('From', fromNumber);
        params.append('Body', `Your LawMate verification code is ${code}. It expires in 15 minutes.`);

        await axios.post(TWILIO_API_URL(accountSid), params, {
            auth: { username: accountSid, password: authToken },
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            timeout: 10000,
        });
        return { delivered: true };
    } catch (err) {
        console.error('[OTP SMS] Twilio send failed:', err.response?.data || err.message);
        return { delivered: false, reason: 'send_failed', error: err.response?.data || err.message };
    }
}

/**
 * Sends an OTP via the requested method ('email' or 'phone'). Always
 * resolves (never throws) so a delivery failure doesn't break the
 * register/login/forgot-password flow that called it — the caller
 * already persists the OTP in the database regardless, so the person
 * can still retrieve it via "Resend" if the first send silently failed.
 */
async function sendOtp(method, destination, code) {
    if (method === 'phone') {
        return sendOtpSms(destination, code);
    }
    return sendOtpEmail(destination, code);
}

module.exports = { sendOtp, sendOtpEmail, sendOtpSms };
