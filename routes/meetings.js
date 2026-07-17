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
            // Previously 'scheduled' — not a valid value in the schema's
            // status enum, which would throw a Mongoose ValidationError on
            // save. Left as the default ('upcoming') instead of setting it
            // explicitly, since that's the only valid starting state.
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

// PUT /api/meetings/:id/status — manual override, kept for the lawyer to
// mark something like 'cancelled' directly. Real attendance resolution
// now goes through POST /:id/respond + the reminder cron instead.
router.put('/:id/status', auth, async (req, res) => {
    try {
        const { status } = req.body;
        const meeting = await Meeting.findByIdAndUpdate(req.params.id, { status }, { new: true });
        if (!meeting) return res.status(404).json({ msg: 'Not found' });

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

// POST /api/meetings/:id/respond — either side answers the "are you
// attending" prompt shown when the meeting starts. body: { response:
// 'joined' | 'dismissed' }. If both sides have now responded, the final
// outcome is resolved immediately rather than waiting for the cron's
// next pass — real-time from the person's point of view, not up to a
// minute of lag.
router.post('/:id/respond', auth, async (req, res) => {
    try {
        const { response } = req.body;
        if (!['joined', 'dismissed'].includes(response)) {
            return res.status(400).json({ msg: "response must be 'joined' or 'dismissed'." });
        }

        const meeting = await Meeting.findById(req.params.id);
        if (!meeting) return res.status(404).json({ msg: 'Meeting not found.' });

        const isClient = meeting.clientId.toString() === req.user.id.toString();
        const isLawyer  = meeting.lawyerId.toString() === req.user.id.toString();
        if (!isClient && !isLawyer) return res.status(403).json({ msg: 'Not authorized.' });

        if (!['upcoming'].includes(meeting.status)) {
            return res.status(400).json({ msg: 'This meeting has already been resolved.' });
        }

        if (isClient) {
            meeting.clientResponse   = response;
            meeting.clientRespondedAt = new Date();
        } else {
            meeting.professionalResponse   = response;
            meeting.professionalRespondedAt = new Date();
        }

        // Resolve immediately once both sides have answered — don't make
        // either person wait for the next cron pass to see the outcome.
        const bothResponded = meeting.clientResponse !== 'pending' && meeting.professionalResponse !== 'pending';
        if (bothResponded) {
            if (meeting.clientResponse === 'joined' && meeting.professionalResponse === 'joined') {
                meeting.status = 'attended';
            } else {
                // Either side explicitly declined — this is a mutual/
                // one-sided dismissal, not a silent no-show.
                meeting.status = 'dismissed';
            }
            meeting.resolvedAt = new Date();
        }

        await meeting.save();

        const otherPartyId = isClient ? meeting.lawyerId : meeting.clientId;
        const responderLabel = isClient ? 'Client' : 'Your professional';
        await Notification.create({
            userId:  otherPartyId,
            type:    'meeting',
            title:   response === 'joined' ? '✅ Joined the meeting' : '❌ Meeting declined',
            message: `${responderLabel} ${response === 'joined' ? 'has joined' : 'declined'} "${meeting.title}".`,
            actionId: meeting.engagementId?.toString() || '',
            isRead:  false,
        });

        try {
            const { emitToRoom } = require('../services/socketService');
            emitToRoom(`engagement:${meeting.engagementId}`, 'meeting:updated', { meeting });
        } catch (e) { console.error('[meetings respond] Socket emit failed:', e.message); }

        res.json({ success: true, meeting });
    } catch (err) {
        console.error('[meetings respond]', err.message);
        res.status(500).json({ msg: 'Server error' });
    }
});

module.exports = router;
