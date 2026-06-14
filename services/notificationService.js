/**
 * Notification Service
 * Handles: mock push notifications + cron-based appointment reminders
 * Uses node-cron for scheduled reminder checks.
 */

const cron        = require('node-cron');
const Notification = require('../models/Notification');
const CaseEngagement = require('../models/CaseEngagement');

// ── Mock push notification sender ────────────────────────────
// Replace the console.log lines with your real push provider
// (e.g. Firebase FCM, OneSignal) when ready.
async function sendPushNotification(userId, message) {
    try {
        // 1. Save to DB so user sees it in their notification feed
        await Notification.create({ userId, message });

        // 2. TODO: Replace with real push provider call
        console.log(`[PUSH] → User ${userId}: ${message}`);
    } catch (err) {
        console.error('[PUSH ERROR]', err.message);
    }
}

// ── Reminder checker ─────────────────────────────────────────
// Checks engagements that have an appointmentTime and are in
// ESCROW_LOCKED status (confirmed + paid). Fires reminders at:
// 24h before, 6h before, 10min before, and at exact start time.
async function checkAndSendReminders() {
    try {
        const now = new Date();

        // Windows to check (in milliseconds)
        const windows = [
            { label: 'Starting NOW',         minMs: -1 * 60 * 1000,   maxMs: 1 * 60 * 1000   },
            { label: 'Starting in 10 minutes', minMs: 9 * 60 * 1000,  maxMs: 11 * 60 * 1000  },
            { label: 'Starting in 6 hours',  minMs: 359 * 60 * 1000,  maxMs: 361 * 60 * 1000 },
            { label: 'Starting in 24 hours', minMs: 1439 * 60 * 1000, maxMs: 1441 * 60 * 1000 }
        ];

        for (const window of windows) {
            const windowStart = new Date(now.getTime() + window.minMs);
            const windowEnd   = new Date(now.getTime() + window.maxMs);

            const engagements = await CaseEngagement.find({
                status: 'ESCROW_LOCKED',
                'schedule.appointmentTime': { $gte: windowStart, $lte: windowEnd }
            });

            for (const eng of engagements) {
                const msg = `📅 Appointment reminder: ${window.label}`;

                // Notify client
                if (eng.clientId) await sendPushNotification(eng.clientId, msg);

                // Notify professional (lawyer or social worker)
                const proId = eng.lawyerId || eng.socialWorkerId;
                if (proId) await sendPushNotification(proId, msg);
            }
        }
    } catch (err) {
        console.error('[REMINDER ERROR]', err.message);
    }
}

// ── Start cron job (runs every minute) ───────────────────────
// Every minute it checks for appointments falling in any window.
function startReminderCron() {
    cron.schedule('* * * * *', () => {
        checkAndSendReminders();
    });
    console.log('⏰ Appointment reminder cron started');
}

module.exports = { sendPushNotification, startReminderCron };
