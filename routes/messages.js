const express = require('express');
const router  = express.Router();
const auth    = require('../middleware/authMiddleware');
const ChatMessage = require('../models/ChatMessage');

// GET /api/messages?engagementId=xxx
router.get('/', auth, async (req, res) => {
    try {
        const { engagementId } = req.query;
        const query = engagementId ? { engagementId } : {
            $or: [{ senderId: req.user.id }, { receiverId: req.user.id }]
        };
        const messages = await ChatMessage.find(query)
            .sort({ createdAt: 1 })
            .limit(200);
        res.json({ success: true, messages });
    } catch (err) {
        res.status(500).json({ msg: 'Server error' });
    }
});

// POST /api/messages/send
router.post('/send', auth, async (req, res) => {
    try {
        const { engagementId, receiverId, message, attachmentUrl, attachmentType, attachmentName } = req.body;
        const msg = new ChatMessage({
            senderId:       req.user.id,
            receiverId,
            engagementId,
            message:        message || '',
            attachmentUrl:  attachmentUrl || '',
            attachmentType: attachmentType || '',
            attachmentName: attachmentName || '',
        });
        await msg.save();
        res.status(201).json({ success: true, message: msg });
    } catch (err) {
        res.status(500).json({ msg: 'Server error' });
    }
});

// POST /api/messages/mark-read
router.post('/mark-read', auth, async (req, res) => {
    try {
        const { engagementId } = req.body;
        await ChatMessage.updateMany(
            { engagementId, receiverId: req.user.id, isRead: false },
            { isRead: true }
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ msg: 'Server error' });
    }
});

module.exports = router;
