const express = require('express');
const router  = express.Router();
const auth    = require('../middleware/authMiddleware');
const ChatMessage      = require('../models/ChatMessage');
const Notification     = require('../models/Notification');
const User              = require('../models/User');
const { NgoApplication } = require('../models/Ngo');

// GET /api/messages?engagementId=xxx
// GET /api/messages?applicationId=xxx&phase=inquiry|case
router.get('/', auth, async (req, res) => {
    try {
        const { engagementId, applicationId, phase } = req.query;
        let query;
        if (applicationId) {
            query = { applicationId };
            if (phase) query.phase = phase;
        } else if (engagementId) {
            query = { engagementId };
        } else {
            query = { $or: [{ senderId: req.user.id }, { receiverId: req.user.id }] };
        }
        const messages = await ChatMessage.find(query)
            .sort({ createdAt: 1 })
            .limit(200);
        res.json({ success: true, messages });
    } catch (err) {
        res.status(500).json({ msg: 'Server error' });
    }
});

// POST /api/messages/send
// For applicationId-scoped sends (NGO inquiry/case chat), the server
// determines the phase itself from the application's CURRENT status —
// it never trusts a client-supplied phase — and rejects the send outright
// if the application isn't in a state that allows messaging right now.
// This is what makes the "block immediately the moment status changes"
// requirement actually hold: there's no cached flag that could go stale,
// every send re-checks the live application status.
router.post('/send', auth, async (req, res) => {
    try {
        const { engagementId, applicationId, receiverId, message, attachmentUrl, attachmentType, attachmentName } = req.body;

        let phase = '';
        let resolvedReceiverId = receiverId;
        if (applicationId) {
            const application = await NgoApplication.findById(applicationId);
            if (!application) return res.status(404).json({ msg: 'Application not found.' });

            const isClient = application.applicantId.toString() === req.user.id.toString();
            const isNgo    = application.ngoUserId?.toString() === req.user.id.toString();
            if (!isClient && !isNgo) return res.status(403).json({ msg: 'Not authorized.' });

            // The other party is always the receiver on an application
            // thread — no need to make the frontend work this out.
            resolvedReceiverId = isClient ? application.ngoUserId : application.applicantId;

            if (application.status === 'inquiry') {
                phase = 'inquiry';
            } else if (application.status === 'accepted') {
                phase = 'case';
            } else if (['pending', 'under_review'].includes(application.status)) {
                return res.status(400).json({ msg: 'This case has not reached the screening stage yet.' });
            } else {
                // rejected, or any other terminal state
                return res.status(403).json({ msg: 'This screening session has concluded.' });
            }
        }

        const msg = new ChatMessage({
            senderId:       req.user.id,
            receiverId:     resolvedReceiverId,
            engagementId:   engagementId || null,
            applicationId:  applicationId || null,
            phase,
            message:        message || '',
            attachmentUrl:  attachmentUrl || '',
            attachmentType: attachmentType || '',
            attachmentName: attachmentName || '',
        });
        await msg.save();

        // Real-time push to whoever else has this room open.
        if (applicationId) {
            try {
                const { emitToRoom } = require('../services/socketService');
                emitToRoom(`ngochat:${applicationId}:${phase}`, 'message:new', msg);
            } catch (socketErr) {
                console.error('[Messages] Socket emit failed:', socketErr.message);
            }
        }

        // Notify the receiver about the new message
        if (resolvedReceiverId) {
            try {
                const sender = await User.findById(req.user.id).select('firstName lastName name role');
                const senderName = sender
                    ? `${sender.firstName || ''} ${sender.lastName || ''}`.trim() || sender.name || 'Someone'
                    : 'Someone';
                const preview = message
                    ? (message.length > 60 ? message.substring(0, 60) + '...' : message)
                    : (attachmentName ? `Sent an attachment: ${attachmentName}` : 'Sent you a message');
                await Notification.create({
                    userId:   resolvedReceiverId,
                    type:     'message',
                    title:    `💬 New message from ${senderName}`,
                    message:  preview,
                    actionId: engagementId || applicationId || '',
                    isRead:   false,
                });
            } catch (notifErr) {
                console.error('[Messages] Notification send failed:', notifErr.message);
            }
        }

        res.status(201).json({ success: true, message: msg });
    } catch (err) {
        console.error('[Messages send]', err.message);
        res.status(500).json({ msg: 'Server error' });
    }
});

// POST /api/messages/mark-read
router.post('/mark-read', auth, async (req, res) => {
    try {
        const { engagementId, applicationId } = req.body;
        const query = applicationId
            ? { applicationId, receiverId: req.user.id, isRead: false }
            : { engagementId, receiverId: req.user.id, isRead: false };
        await ChatMessage.updateMany(query, { isRead: true });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ msg: 'Server error' });
    }
});

module.exports = router;
