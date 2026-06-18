const express  = require('express');
const router   = express.Router();
const auth     = require('../middleware/authMiddleware');
const Meeting  = require('../models/Meeting');

// GET /api/meetings?engagementId=xxx
router.get('/', auth, async (req, res) => {
    try {
        const { engagementId } = req.query;
        if (!engagementId) return res.status(400).json({ msg: 'engagementId required' });
        const meetings = await Meeting.find({ engagementId }).sort({ date: 1 });
        res.json({ success: true, meetings });
    } catch (err) { res.status(500).json({ msg: 'Server error' }); }
});

// PUT /api/meetings/:id/status
router.put('/:id/status', auth, async (req, res) => {
    try {
        const { status } = req.body;
        const meeting = await Meeting.findByIdAndUpdate(req.params.id, { status }, { new: true });
        if (!meeting) return res.status(404).json({ msg: 'Not found' });
        res.json({ success: true, meeting });
    } catch (err) { res.status(500).json({ msg: 'Server error' }); }
});

module.exports = router;
