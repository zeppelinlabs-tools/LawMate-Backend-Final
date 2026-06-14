const Appointment = require('../models/Appointment');
const User        = require('../models/User');

// GET /api/appointments
exports.getAppointments = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ msg: 'User not found' });

        const query = {};
        if (user.role === 'lawyer' || user.role === 'social_worker') {
            query.lawyerId = user._id;
        } else {
            query.clientId = user._id;
        }

        const appointments = await Appointment.find(query)
            .populate('clientId', 'name firstName lastName profilePic')
            .populate('lawyerId', 'name firstName lastName profilePic')
            .sort({ date: 1 });

        res.json(appointments);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
};

// POST /api/appointments
exports.createAppointment = async (req, res) => {
    try {
        const { lawyerId, date, time, reason, clientId } = req.body;
        const finalClientId = req.user?.id || clientId;

        if (!finalClientId) return res.status(400).json({ msg: 'Client ID is required' });
        if (!lawyerId)      return res.status(400).json({ msg: 'Lawyer ID is required' });

        const newAppointment = new Appointment({
            clientId: finalClientId,
            lawyerId,
            date,
            time:   time   || '',
            reason: reason || ''
        });

        await newAppointment.save();
        res.status(201).json(newAppointment);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: err.message });
    }
};

// PUT /api/appointments/:id/status  (lawyer approves/rejects)
exports.updateStatus = async (req, res) => {
    try {
        const { status } = req.body;
        const allowed = ['pending', 'approved', 'rejected', 'completed'];
        if (!allowed.includes(status))
            return res.status(400).json({ msg: 'Invalid status' });

        const appt = await Appointment.findById(req.params.id);
        if (!appt) return res.status(404).json({ msg: 'Appointment not found' });

        appt.status = status;
        await appt.save();
        res.json(appt);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
};
