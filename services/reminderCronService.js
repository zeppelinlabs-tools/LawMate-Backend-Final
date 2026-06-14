/**
 * Reminder Cron Service
 * Runs scheduled jobs to send appointment reminders at:
 * - 24 hours before
 * - 6 hours before
 * - 10 minutes before
 * - At exact start time
 *
 * Uses node-cron (runs every minute to check upcoming appointments).
 * Notifications are saved to the Notification collection.
 */

const cron           = require('node-cron');
const CaseEngagement = require('../models/CaseEngagement');
const Notification   = require('../models/Notification');

// ── Internal helper: save notification ───────────────────────
async function notify(userId, message) {
    try {
        await Notification.create({ userId, message });
        // TODO: replace with real push notification (FCM, OneSignal, etc.)
        console.log(`[REMINDER] → User ${userId}: ${message}`);
    } catch (e) {
        console.error('[REMINDER] Notification error:', e.message);
    }
}

// ── Internal helper: get professional ID ─────────────────────
function getProfId(engagement) {
    return engagement.lawyerId || engagement.socialWorkerId || null;
}

// ── Check upcoming appointments ───────────────────────────────
async function checkReminders() {
    const now = new Date();

    // Time windows to check (in minutes)
    const windows = [
        { minutes: 1440, label: '24 hours' },   // 24 hours
        { minutes: 360,  label: '6 hours'  },   // 6 hours
        { minutes: 10,   label: '10 minutes'},  // 10 minutes
        { minutes: 0,    label: 'now'       }   // exact start
    ];

    for (const window of windows) {
        // Target time = now + window (with ±1 minute tolerance)
        const targetTime   = new Date(now.getTime() + window.minutes * 60 * 1000);
        const windowStart  = new Date(targetTime.getTime() - 60 * 1000); // -1 min
        const windowEnd    = new Date(targetTime.getTime() + 60 * 1000); // +1 min

        try {
            const engagements = await CaseEngagement.find({
                status: 'ESCROW_LOCKED',
                'schedule.appointmentTime': {
                    $gte: windowStart,
                    $lte: windowEnd
                }
            });

            for (const eng of engagements) {
                const profId  = getProfId(eng);
                const timeStr = eng.schedule.appointmentTime
                    ? eng.schedule.appointmentTime.toLocaleString()
                    : 'scheduled time';

                // Message based on timing
                let clientMsg, profMsg;

                if (window.minutes === 0) {
                    clientMsg = `🔴 Your session is starting NOW! Join using Room ID: ${eng.schedule.videoRoomId}`;
                    profMsg   = `🔴 Your client session is starting NOW! Room ID: ${eng.schedule.videoRoomId}`;
                } else {
                    clientMsg = `⏰ Reminder: Your session starts in ${window.label} at ${timeStr}.`;
                    profMsg   = `⏰ Reminder: Your client session starts in ${window.label} at ${timeStr}.`;
                }

                await notify(eng.clientId, clientMsg);
                if (profId) await notify(profId, profMsg);
            }

        } catch (e) {
            console.error(`[REMINDER] Error checking ${window.label} window:`, e.message);
        }
    }
}

// ── Start the cron job ────────────────────────────────────────
// Runs every minute: '* * * * *'
function startReminderCron() {
    cron.schedule('* * * * *', async () => {
        await checkReminders();
    });
    console.log('⏰ Appointment reminder cron started (checks every minute)');
}

module.exports = { startReminderCron };
