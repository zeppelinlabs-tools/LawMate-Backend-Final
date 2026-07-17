if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config();
}
const express   = require('express');
const cors      = require('cors');
const path      = require('path');
const connectDB = require('./config/database');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use('/api/messages', require('./routes/messages'));

// ── Models ────────────────────────────────────────────────────
require('./models/User');
require('./models/LawCategory');
require('./models/Law');
require('./models/Post');
require('./models/Appointment');
require('./models/Notification');
require('./models/Document');
require('./models/ChatMessage');
require('./models/ScrapedLaw');
require('./models/LegalCase');
require('./models/Ngo');
require('./models/CaseEngagement');
require('./models/Otp');
require('./models/ChatSession');

// ── Routes ────────────────────────────────────────────────────
app.use('/api/auth',                           require('./routes/auth'));
app.use('/api/laws',                           require('./routes/law'));
app.use('/api/lawyers',                        require('./routes/lawyers'));
app.use('/api/feed',                           require('./routes/feed'));
app.use('/api/appointments',                   require('./routes/appointments'));
app.use('/api/chat',                           require('./routes/chat'));
app.use('/api/documents',                      require('./routes/documents'));
app.use('/api/notifications',                  require('./routes/notifications'));
app.use('/api/scraped-laws',                   require('./routes/scrapedLaws'));
app.use('/api/legal-cases',                    require('./routes/legalCases'));
app.use('/api/ngos',                           require('./routes/ngos'));
app.use('/api/bills',                          require('./routes/bills'));
app.use('/api/meetings',                       require('./routes/meetings'));
app.use('/api/engagements',                    require('./routes/engagements'));
app.use('/api/ratings',                        require('./routes/ratings'));
app.use('/api/document-vault',                 require('./routes/documentVault'));
app.use('/api/users/notification-preferences', require('./routes/userPreferences'));

// ── Static files ──────────────────────────────────────────────
app.use('/documents', express.static(path.join(__dirname, 'uploads', 'documents')));

// ── Health check ──────────────────────────────────────────────
app.get('/api/health', (req, res) => res.json({ status: 'ok', msg: 'LawMate API is running' }));

// Landing pages for Safepay's redirect_url/cancel_url — the checkout
// itself is always inside the app's in-app WebView (see
// PaymentCheckoutScreen), so a real person is very unlikely to ever
// actually land on these. They exist so the URLs resolve to something
// real rather than a 404, in case Safepay's checkout validates that the
// redirect domain responds before allowing checkout to proceed.
app.get('/api/payment-success', (req, res) => {
    res.send('<html><body style="font-family:sans-serif;text-align:center;padding:60px 20px;"><h2>Payment complete</h2><p>You can close this window and return to the LawMate app.</p></body></html>');
});
app.get('/api/payment-cancelled', (req, res) => {
    res.send('<html><body style="font-family:sans-serif;text-align:center;padding:60px 20px;"><h2>Payment cancelled</h2><p>You can close this window and return to the LawMate app.</p></body></html>');
});

// ── Global error handler ────────────────────────────────────────
// Must be registered AFTER all routes. Without this, an error thrown
// by multer (file too large, wrong file type, malformed multipart
// body) or any other uncaught error in a route handler had no
// consistent JSON response — depending on the exact failure, the
// client could see a generic HTML error page, a hang, or a
// connection reset, none of which the Flutter app's error handling
// could parse into a useful message. This was part of why attachment
// uploads on the connection-request flow could fail with literally no
// feedback to the user.
const multer = require('multer');
app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        let msg = 'File upload failed.';
        if (err.code === 'LIMIT_FILE_SIZE') msg = 'File is too large.';
        if (err.code === 'LIMIT_UNEXPECTED_FILE') msg = 'Unexpected file field.';
        return res.status(400).json({ success: false, msg, code: err.code });
    }
    if (err) {
        console.error('[Unhandled Error]', err.message);
        return res.status(err.status || 500).json({
            success: false,
            msg: err.message || 'Server error.',
        });
    }
    next();
});

const PORT = process.env.PORT || 4000;

connectDB().then(() => {
    const server = app.listen(PORT, () => {
        console.log(`🚀 Server running on port ${PORT}`);
        try {
            const { startReminderCron } = require('./services/reminderCronService');
            startReminderCron();
        } catch (e) {
            console.warn('⚠️  Reminder cron not started:', e.message);
        }
    });

    // Socket.io must attach to the exact same underlying HTTP server
    // Express is using, not a separate one, so real-time clients connect
    // on the same host:port the REST API already runs on.
    try {
        const { initSocketServer } = require('./services/socketService');
        initSocketServer(server);
    } catch (e) {
        console.warn('⚠️  Socket.io server not started:', e.message);
    }
}).catch(err => {
    console.error('Failed to start server:', err);
    process.exit(1);
});
