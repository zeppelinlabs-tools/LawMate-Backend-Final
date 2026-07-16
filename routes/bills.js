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
        await Notification.create({ userId: clientId, type: 'bill', title: 'New Bill Received', message: `${title} — PKR ${amount}`, isRead: false });
        res.status(201).json({ success: true, bill });
    } catch (err) { res.status(500).json({ msg: 'Server error' }); }
});

// POST /api/bills/:id/initialize-payment
// Client starts real payment for a bill. If amount is 0, the bill is
// treated as free and confirmed immediately (no gateway involved) — same
// free-bypass behavior the chat chit flow already has, so a lawyer who
// wants to bill PKR 0 for a free consultation doesn't hit a Safepay call
// for nothing.
router.post('/:id/initialize-payment', auth, async (req, res) => {
    try {
        const bill = await Bill.findById(req.params.id);
        if (!bill) return res.status(404).json({ msg: 'Bill not found' });
        if (bill.clientId.toString() !== req.user.id) return res.status(403).json({ msg: 'Not authorized' });
        if (bill.status === 'paid') return res.status(400).json({ msg: 'This bill has already been paid.' });
        if (bill.status === 'cancelled') return res.status(400).json({ msg: 'This bill has been cancelled.' });

        if (bill.amount <= 0) {
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
            await Notification.create({ userId: bill.lawyerId, type: 'bill', title: 'Bill Confirmed (Free)', message: `${bill.title} confirmed — no charge.`, isRead: false });
            return res.json({ success: true, isFree: true, bill });
        }

        const paymentService = require('../services/paymentService');
        if (!paymentService.isConfigured()) {
            return res.status(500).json({ msg: 'Safepay is not configured. Add SAFEPAY_SECRET_KEY to your .env file.' });
        }

        const session = await paymentService.createCheckoutSession({
            referenceType: 'bill',
            referenceId:   bill._id.toString(),
            amount:        bill.amount,
        });

        res.json({
            success:     true,
            isFree:      false,
            checkoutUrl: session.checkoutUrl,
            amount:      bill.amount,
            currency:    'PKR',
        });
    } catch (err) {
        if (err.response?.data) {
            console.error('[bills initialize-payment] Safepay API error:', err.response.data);
            return res.status(502).json({ msg: 'Safepay API error', error: err.response.data });
        }
        console.error('[bills initialize-payment]', err.message);
        res.status(500).json({ msg: 'Server error' });
    }
});

// PUT /api/bills/:id/pay — DEPRECATED. Previously set status='paid'
// directly with no payment gateway involved at all (the client was
// self-confirming their own payment). Left in place only to return a
// clear error instead of a 404, in case an old cached app build still
// calls it — real payment goes through POST /:id/initialize-payment above.
router.put('/:id/pay', auth, async (req, res) => {
    res.status(410).json({
        msg: 'This endpoint no longer confirms payment directly. Use POST /api/bills/:id/initialize-payment instead — payment is now verified through Safepay before a bill is marked paid.'
    });
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
