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
            isVerified: true,
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

// ─────────────────────────────────────────────────────────────
// MANUAL VERIFICATION (no admin panel/account yet — these three
// endpoints are protected by a shared secret key, ADMIN_SECRET_KEY,
// set in .env, rather than requiring a logged-in admin user. Until
// there's a real admin system, this lets Hamza review and approve
// lawyer/social-worker signups himself via a quick request from
// Postman, curl, or a browser REST client — see README/setup notes
// for the exact call shape.
// ─────────────────────────────────────────────────────────────

function checkAdminSecret(req, res) {
    const provided = req.headers['x-admin-secret'] || req.query.adminSecret;
    const expected = process.env.ADMIN_SECRET_KEY;

    if (!expected) {
        res.status(500).json({
            msg: 'ADMIN_SECRET_KEY is not set in .env — manual verification is disabled until you set one.'
        });
        return false;
    }
    if (!provided || provided !== expected) {
        res.status(403).json({ msg: 'Invalid or missing admin secret.' });
        return false;
    }
    return true;
}

// ── GET /api/lawyers/admin/pending ────────────────────────────
// Lists every lawyer/social-worker account waiting on manual review
// — i.e. they've finished email/phone OTP verification (so the
// account is real) but isVerified is still false (so they're hidden
// from clients). Returns just enough to make a decision: identity,
// documents, and what they submitted at signup.
exports.getPendingProfessionals = async (req, res) => {
    if (!checkAdminSecret(req, res)) return;
    try {
        const pending = await User.find({
            role:              { $in: ['lawyer', 'social_worker', 'ngo'] },
            isVerified:        false,
            isAccountVerified: true, // only show people who finished OTP — half-signed-up accounts aren't ready for review yet
        })
            .select('-password')
            .sort({ createdAt: -1 });

        res.json({ count: pending.length, pending });
    } catch (err) {
        console.error('[Admin GET pending]', err.message);
        res.status(500).send('Server error');
    }
};

// ── PUT /api/lawyers/admin/:id/verify ─────────────────────────
// Body: { approve: true | false, reason?: string }
// Flips isVerified to true (approve) or leaves it false and records
// a rejection reason (reject) so the lawyer/social worker shows up —
// or doesn't — in the public directory accordingly.
exports.setProfessionalVerification = async (req, res) => {
    if (!checkAdminSecret(req, res)) return;
    try {
        const { approve, reason } = req.body;
        const user = await User.findById(req.params.id);

        if (!user) return res.status(404).json({ msg: 'User not found.' });
        if (!['lawyer', 'social_worker', 'ngo'].includes(user.role)) {
            return res.status(400).json({ msg: 'Only lawyer/social_worker/ngo accounts go through this verification step.' });
        }

        user.isVerified = approve === true || approve === 'true';
        user.verificationRejectionReason = user.isVerified ? '' : (reason || '');
        await user.save();

        res.json({
            success:    true,
            msg:        user.isVerified
                ? `${user.firstName || user.name} is now verified and visible in the public directory.`
                : `${user.firstName || user.name} was not approved.${reason ? ` Reason: ${reason}` : ''}`,
            isVerified: user.isVerified,
        });
    } catch (err) {
        console.error('[Admin SET verification]', err.message);
        res.status(500).send('Server error');
    }
};
