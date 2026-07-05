const express  = require('express');
const router   = express.Router();
const auth     = require('../middleware/authMiddleware');
const Meeting      = require('../models/Meeting');
const Notification = require('../models/Notification');

// GET /api/meetings?engagementId=xxx
router.get('/', auth, async (req, res) => {
    try {
        const { engagementId } = req.query;
        if (!engagementId) return res.status(400).json({ msg: 'engagementId required' });
        const meetings = await Meeting.find({ engagementId }).sort({ date: 1 });
        res.json({ success: true, meetings });
    } catch (err) { res.status(500).json({ msg: 'Server error' }); }
});

// POST /api/meetings — lawyer schedules a meeting and notifies client
router.post('/', auth, async (req, res) => {
    try {
        const { engagementId, clientId, title, date, time, type, address, notes } = req.body;
        if (!engagementId || !clientId || !title) {
            return res.status(400).json({ msg: 'engagementId, clientId, title required' });
        }
        const meeting = new Meeting({
            engagementId,
            lawyerId: req.user.id,
            clientId,
            title,
            date:    date    ? new Date(date) : null,
            time:    time    || '',
            type:    type    || 'online',
            address: address || '',
            notes:   notes   || '',
            status:  'scheduled',
        });
        await meeting.save();

        // Notify client about new meeting
        const dateStr = date ? new Date(date).toLocaleDateString('en-PK') : '';
        await Notification.create({
            userId:  clientId,
            type:    'meeting',
            title:   '📅 Meeting Scheduled',
            message: `${title}${dateStr ? ' — ' + dateStr : ''}${time ? ' at ' + time : ''}`,
            actionId: engagementId,
            isRead:  false,
        });

        res.status(201).json({ success: true, meeting });
    } catch (err) { res.status(500).json({ msg: 'Server error' }); }
});

// PUT /api/meetings/:id/status
router.put('/:id/status', auth, async (req, res) => {
    try {
        const { status } = req.body;
        const meeting = await Meeting.findByIdAndUpdate(req.params.id, { status }, { new: true });
        if (!meeting) return res.status(404).json({ msg: 'Not found' });

        // Notify client on confirmation
        if (status === 'confirmed' && meeting.clientId) {
            Notification.create({
                userId:  meeting.clientId,
                type:    'meeting',
                title:   '✅ Meeting Confirmed',
                message: `Your meeting "${meeting.title}" has been confirmed.`,
                actionId: meeting.engagementId?.toString() || '',
                isRead:  false,
            }).catch(() => {});
        }

        res.json({ success: true, meeting });
    } catch (err) { res.status(500).json({ msg: 'Server error' }); }
});

module.exports = router;
