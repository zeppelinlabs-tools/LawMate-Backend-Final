const express  = require('express');
const router   = express.Router();
const auth     = require('../middleware/authMiddleware');
const Bill     = require('../models/Bill');
const Meeting  = require('../models/Meeting');
const Notification = require('../models/Notification');

// GET /api/bills?engagementId=xxx
router.get('/', auth, async (req, res) => {
    try {
        const { engagementId } = req.query;
        if (!engagementId) return res.status(400).json({ msg: 'engagementId required' });
        const bills = await Bill.find({ engagementId }).sort({ createdAt: -1 });
        res.json({ success: true, bills });
    } catch (err) { res.status(500).json({ msg: 'Server error' }); }
});

// POST /api/bills
router.post('/', auth, async (req, res) => {
    try {
        const { engagementId, clientId, title, amount, notes, meetingDate, meetingTime, meetingType, meetingAddress } = req.body;
        if (!engagementId || !clientId || !title) return res.status(400).json({ msg: 'engagementId, clientId, title required' });
        const bill = new Bill({
            engagementId, lawyerId: req.user.id, clientId,
            title, amount: Number(amount) || 0, notes: notes || '',
            meetingDate: meetingDate ? new Date(meetingDate) : null,
            meetingTime: meetingTime || '', meetingType: meetingType || 'online', meetingAddress: meetingAddress || '',
        });
        await bill.save();
        await Notification.create({ userId: clientId, message: `New bill: ${title} — PKR ${amount}`, isRead: false });
        res.status(201).json({ success: true, bill });
    } catch (err) { res.status(500).json({ msg: 'Server error' }); }
});

// PUT /api/bills/:id/pay
router.put('/:id/pay', auth, async (req, res) => {
    try {
        const bill = await Bill.findById(req.params.id);
        if (!bill) return res.status(404).json({ msg: 'Bill not found' });
        if (bill.clientId.toString() !== req.user.id) return res.status(403).json({ msg: 'Not authorized' });
        bill.status = 'paid';
        bill.paidAt = new Date();
        await bill.save();
        if (bill.meetingDate) {
            await Meeting.create({
                engagementId: bill.engagementId, lawyerId: bill.lawyerId, clientId: bill.clientId,
                billId: bill._id, title: bill.title, date: bill.meetingDate,
                time: bill.meetingTime, type: bill.meetingType, address: bill.meetingAddress, notes: bill.notes,
            });
        }
        await Notification.create({ userId: bill.lawyerId, message: `Bill paid: ${bill.title} — PKR ${bill.amount}`, isRead: false });
        res.json({ success: true, bill });
    } catch (err) { res.status(500).json({ msg: 'Server error' }); }
});

// DELETE /api/bills/:id
router.delete('/:id', auth, async (req, res) => {
    try {
        const bill = await Bill.findById(req.params.id);
        if (!bill) return res.status(404).json({ msg: 'Bill not found' });
        if (bill.lawyerId.toString() !== req.user.id) return res.status(403).json({ msg: 'Not authorized' });
        bill.status = 'cancelled';
        await bill.save();
        res.json({ success: true });
    } catch (err) { res.status(500).json({ msg: 'Server error' }); }
});

module.exports = router;
