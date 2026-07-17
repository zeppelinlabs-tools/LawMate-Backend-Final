const Rating          = require('../models/Rating');
const CaseEngagement  = require('../models/CaseEngagement');
const User            = require('../models/User');
const Notification    = require('../models/Notification');

function getProfessionalId(engagement) {
    return engagement.lawyerId || engagement.socialWorkerId || null;
}

// Recomputes and caches a professional's average rating on their User
// document — called once after every new rating rather than aggregating
// the whole Rating collection on every profile view.
async function recomputeAverage(professionalId) {
    const stats = await Rating.aggregate([
        { $match: { professionalId } },
        { $group: { _id: null, avg: { $avg: '$stars' }, count: { $sum: 1 } } },
    ]);
    const avg   = stats[0]?.avg ? parseFloat(stats[0].avg.toFixed(1)) : 0;
    const count = stats[0]?.count || 0;
    await User.findByIdAndUpdate(professionalId, { avgRating: avg, ratingCount: count });
    return { avg, count };
}

// ── POST /api/ratings ──────────────────────────────────────────
// Client rates a completed engagement. One rating per engagement, ever.
exports.submitRating = async (req, res) => {
    try {
        const { engagementId, stars, comment } = req.body;
        const starsNum = Number(stars);
        if (!engagementId) return res.status(400).json({ msg: 'engagementId is required.' });
        if (!starsNum || starsNum < 1 || starsNum > 5) return res.status(400).json({ msg: 'stars must be between 1 and 5.' });

        const engagement = await CaseEngagement.findById(engagementId);
        if (!engagement) return res.status(404).json({ msg: 'Engagement not found.' });

        if (engagement.clientId.toString() !== req.user.id.toString())
            return res.status(403).json({ msg: 'Only the client on this engagement can rate it.' });

        if (engagement.status !== 'COMPLETED')
            return res.status(400).json({ msg: 'You can only rate a session after it has been completed.' });

        const existing = await Rating.findOne({ engagementId });
        if (existing) return res.status(409).json({ msg: 'You have already rated this session.' });

        const professionalId = getProfessionalId(engagement);
        if (!professionalId) return res.status(400).json({ msg: 'No professional found on this engagement.' });

        const rating = await Rating.create({
            engagementId,
            raterId: req.user.id,
            professionalId,
            stars: starsNum,
            comment: comment || '',
        });

        const { avg, count } = await recomputeAverage(professionalId);

        await Notification.create({
            userId:  professionalId,
            type:    'rating',
            title:   '⭐ New Rating',
            message: `You received a ${starsNum}-star rating.${comment ? ` "${comment}"` : ''}`,
            actionId: engagementId,
            isRead:  false,
        });

        res.status(201).json({ success: true, rating, professionalAvgRating: avg, professionalRatingCount: count });
    } catch (err) {
        // The unique index on engagementId is the real guard against a
        // race condition slipping two ratings through — surface that
        // specific case with a clear message rather than a generic 500.
        if (err.code === 11000) {
            return res.status(409).json({ msg: 'You have already rated this session.' });
        }
        console.error('[submitRating]', err.message);
        res.status(500).json({ msg: 'Server error' });
    }
};

// ── GET /api/ratings/professional/:professionalId ────────────────
// Public — powers the real rating display on a professional's profile,
// replacing what was previously a hardcoded "0.0 (0)" placeholder.
exports.getProfessionalRatings = async (req, res) => {
    try {
        const { professionalId } = req.params;
        const page  = parseInt(req.query.page, 10)  || 1;
        const limit = parseInt(req.query.limit, 10) || 20;

        const [professional, ratings, total] = await Promise.all([
            User.findById(professionalId).select('avgRating ratingCount'),
            Rating.find({ professionalId })
                .populate('raterId', 'name firstName lastName profilePic')
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit),
            Rating.countDocuments({ professionalId }),
        ]);

        const breakdown = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
        const allForBreakdown = await Rating.find({ professionalId }).select('stars');
        allForBreakdown.forEach(r => { breakdown[r.stars] = (breakdown[r.stars] || 0) + 1; });

        res.json({
            success: true,
            avgRating: professional?.avgRating || 0,
            ratingCount: professional?.ratingCount || 0,
            breakdown,
            reviews: ratings,
            page,
            totalPages: Math.ceil(total / limit),
        });
    } catch (err) {
        console.error('[getProfessionalRatings]', err.message);
        res.status(500).json({ msg: 'Server error' });
    }
};

// ── GET /api/ratings/pending ───────────────────────────────────
// Client-only — every completed engagement they haven't rated yet. This
// is what drives the "rate your experience" prompt, checked on app open
// / dashboard load rather than baked into a notification the person
// might dismiss without acting on.
exports.getPendingRatings = async (req, res) => {
    try {
        const completed = await CaseEngagement.find({
            clientId: req.user.id,
            status: 'COMPLETED',
        }).populate('lawyerId socialWorkerId', 'name firstName lastName profilePic');

        const rated = await Rating.find({ raterId: req.user.id }).select('engagementId');
        const ratedIds = new Set(rated.map(r => r.engagementId.toString()));

        const pending = completed
            .filter(e => !ratedIds.has(e._id.toString()))
            .map(e => {
                const professional = e.lawyerId || e.socialWorkerId;
                return {
                    engagementId: e._id,
                    professionalId: professional?._id,
                    professionalName: professional
                        ? (professional.name || `${professional.firstName || ''} ${professional.lastName || ''}`.trim())
                        : '',
                    professionalPic: professional?.profilePic || '',
                    engagementType: e.engagementType,
                };
            });

        res.json({ success: true, pending });
    } catch (err) {
        console.error('[getPendingRatings]', err.message);
        res.status(500).json({ msg: 'Server error' });
    }
};
