const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const auth = require('../middleware/authMiddleware');

router.get('/', auth, notificationController.listNotifications);
router.post('/', auth, notificationController.createNotification);
router.post('/fcm-token', auth, notificationController.registerFcmToken);
router.put('/:id/read', auth, notificationController.markRead);
// Mark all read
router.put('/mark-all-read', auth, async (req, res) => {
    try {
        const Notification = require('../models/Notification');
        await Notification.updateMany(
            { userId: req.user.id },
            { isRead: true }
        );
        res.json({ success: true });
    } catch (err) { res.status(500).json({ msg: 'Server error' }); }
});

// Delete notification
router.delete('/:id', auth, async (req, res) => {
    try {
        const Notification = require('../models/Notification');
        await Notification.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ msg: 'Server error' }); }
});

module.exports = router;
