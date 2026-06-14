const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const auth = require('../middleware/authMiddleware');

router.get('/', auth, notificationController.listNotifications);
router.post('/', auth, notificationController.createNotification);
router.post('/fcm-token', auth, notificationController.registerFcmToken);
router.put('/:id/read', auth, notificationController.markRead);

module.exports = router;
