/**
 * Verified Only Middleware
 * Blocks unverified lawyers from:
 * - Appearing in public directory listings
 * - Initiating consultation contracts
 *
 * Usage: apply to any route that should only show verified professionals.
 * This middleware must come AFTER the auth middleware.
 */

const User = require('../models/User');

// ── Gate: blocks unverified lawyers from acting ───────────────
// Applied to routes like POST /engagements/request
// If the PROFESSIONAL being requested is unverified, block it.
const blockUnverifiedProfessional = async (req, res, next) => {
    try {
        const { professionalId } = req.body;
        if (!professionalId) return next(); // no professional to check

        const professional = await User.findById(professionalId).select('role isVerified');
        if (!professional) return next();

        if (['lawyer', 'social_worker'].includes(professional.role) && !professional.isVerified) {
            return res.status(403).json({
                msg: 'This professional is not yet verified and cannot accept consultations.'
            });
        }

        next();
    } catch (err) {
        console.error('[verifiedOnly]', err.message);
        res.status(500).send('Server error');
    }
};

module.exports = { blockUnverifiedProfessional };
