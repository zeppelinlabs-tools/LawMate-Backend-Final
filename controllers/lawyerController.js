const User = require('../models/User');

// ── GET /api/lawyers ──────────────────────────────────────────
// Only returns VERIFIED lawyers in public directory.
// Supports filtering by city, specialization, maxFee.
exports.getLawyers = async (req, res) => {
    try {
        const { city, specialization, maxFee } = req.query;

        // isVerified: true — unverified lawyers are hidden from public listing
        const query = { role: 'lawyer', isVerified: true };

        if (city)           query.city           = city;
        if (specialization) query.specialization = { $regex: specialization, $options: 'i' };
        if (maxFee)         query.consultationFee = { $lte: Number(maxFee) };

        const lawyers = await User.find(query).select('-password');
        res.json(lawyers);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
};

// ── GET /api/lawyers/social-workers ──────────────────────────
// Only returns VERIFIED social workers.
exports.getSocialWorkers = async (req, res) => {
    try {
        const workers = await User.find({
            role:       'social_worker',
            isVerified: true
        }).select('-password');
        res.json(workers);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
};

// ── GET /api/lawyers/:id ──────────────────────────────────────
exports.getLawyerById = async (req, res) => {
    try {
        const lawyer = await User.findOne({
            _id:        req.params.id,
            role:       { $in: ['lawyer', 'social_worker'] },
            isVerified: true
        }).select('-password');

        if (!lawyer) return res.status(404).json({ msg: 'Professional not found or not verified.' });
        res.json(lawyer);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
};
