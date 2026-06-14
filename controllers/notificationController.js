const Notification = require('../models/Notification');
const User         = require('../models/User');

// ── GET /api/notifications ────────────────────────────────────
exports.listNotifications = async (req, res) => {
    try {
        const notifications = await Notification.find({ userId: req.user.id })
            .sort({ createdAt: -1 });

        // Format to match Flutter NotificationModel (title, body, type fields)
        const formatted = notifications.map(n => ({
            _id:       n._id,
            userId:    n.userId,
            // Flutter expects title/body/type — map from message
            title:     n.title     || 'Notification',
            body:      n.body      || n.message || '',
            type:      n.type      || 'general',
            message:   n.message   || n.body || '',
            isRead:    n.isRead,
            createdAt: n.createdAt
        }));

        res.json(formatted);
    } catch (err) {
        console.error('[Notifications GET]', err.message);
        res.status(500).send('Server error');
    }
};

// ── POST /api/notifications ───────────────────────────────────
exports.createNotification = async (req, res) => {
    try {
        const { message, title, body, type, userId } = req.body;

        // Accept either message or body field
        const notifMessage = message || body || '';
        if (!notifMessage.trim())
            return res.status(400).json({ msg: 'message is required.' });

        const targetUserId = userId || req.user.id;

        const notification = new Notification({
            userId:  targetUserId,
            message: notifMessage.trim(),
            isRead:  false
        });

        await notification.save();

        res.status(201).json({
            _id:       notification._id,
            userId:    notification.userId,
            title:     title || 'Notification',
            body:      notifMessage,
            message:   notifMessage,
            type:      type || 'general',
            isRead:    false,
            createdAt: notification.createdAt
        });
    } catch (err) {
        console.error('[Notifications POST]', err.message);
        res.status(500).send('Server error');
    }
};

// ── PUT /api/notifications/:id/read ──────────────────────────
exports.markRead = async (req, res) => {
    try {
        const notification = await Notification.findOne({
            _id:    req.params.id,
            userId: req.user.id
        });

        if (!notification)
            return res.status(404).json({ msg: 'Notification not found' });

        notification.isRead = true;
        await notification.save();
        res.json(notification);
    } catch (err) {
        console.error('[Notifications READ]', err.message);
        res.status(500).send('Server error');
    }
};

// ── POST /api/notifications/fcm-token ────────────────────────
exports.registerFcmToken = async (req, res) => {
    try {
        const { token } = req.body;
        if (!token) return res.status(400).json({ msg: 'FCM token is required' });

        const user = await User.findByIdAndUpdate(
            req.user.id,
            { fcmToken: token },
            { new: true }
        );

        if (!user) return res.status(404).json({ msg: 'User not found' });
        res.json({ ok: true });
    } catch (err) {
        console.error('[FCM Token]', err.message);
        res.status(500).send('Server error');
    }
};
