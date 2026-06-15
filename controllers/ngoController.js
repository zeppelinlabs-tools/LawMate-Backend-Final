const { Ngo, NgoApplication } = require('../models/Ngo');

// ── GET /api/ngos ─────────────────────────────────────────────
exports.getNgos = async (req, res) => {
    try {
        const query = { isActive: true };
        if (req.query.city && req.query.city !== 'All Cities')
            query.city = { $regex: req.query.city, $options: 'i' };
        if (req.query.focusArea) query.focusAreas = req.query.focusArea;
        if (req.query.category)  query.categories = req.query.category;

        const ngos = await Ngo.find(query).sort({ createdAt: -1 });
        res.json(ngos);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
};

// ── GET /api/ngos/:id ─────────────────────────────────────────
exports.getNgo = async (req, res) => {
    try {
       // NGO data is from frontend mock — skip MongoDB lookup
       const ngoName = req.body.ngoName || ngoId || 'Unknown NGO';
        res.json(ngo);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
};

// ── POST /api/ngos/apply ──────────────────────────────────────
exports.applyToNgo = async (req, res) => {
    try {
        const {
            ngoId, applicantName, phone, issueType,
            caseFocusCategory, applicantMonthlyIncome,
            caseSummary, description, attachedDocuments
        } = req.body;

        if (!ngoId) return res.status(400).json({ msg: 'ngoId is required' });

        const ngo = await Ngo.findById(ngoId);
        if (!ngo) return res.status(404).json({ msg: 'NGO not found' });

        // Generate reference ID
        const ts = Date.now().toString(16).toUpperCase();
        const referenceId = `LAM-${ts}`;

        const application = new NgoApplication({
            ngoId,
            applicantId:            req.user.id,
            applicantName:          applicantName          || '',
            phone:                  phone                  || '',
            issueType:              issueType              || '',
            caseFocusCategory:      caseFocusCategory      || '',
            applicantMonthlyIncome: applicantMonthlyIncome || '',
            caseSummary:            caseSummary            || '',
            description:            description            || '',
            attachedDocuments:      Array.isArray(attachedDocuments) ? attachedDocuments : [],
            status:                 'pending'
        });

        await application.save();

        res.status(201).json({
            msg:         'Application submitted successfully',
            referenceId,
            status:      'Pending Triage',
            application
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
};

// ── GET /api/ngos/:id/applications ───────────────────────────
exports.getNgoApplications = async (req, res) => {
    try {
        const ngo = await Ngo.findById(req.params.id);
        if (!ngo) return res.status(404).json({ msg: 'NGO not found' });

        if (ngo.ownerId && ngo.ownerId.toString() !== req.user.id.toString())
            return res.status(403).json({ msg: 'Not authorized' });

        const applications = await NgoApplication.find({ ngoId: ngo._id })
            .populate('applicantId', 'name email phone')
            .sort({ createdAt: -1 });

        res.json(applications);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
};

// ── POST /api/ngos ────────────────────────────────────────────
exports.createNgo = async (req, res) => {
    try {
        const {
            name, subtitle, description, founderOrLeader,
            city, address, phone, helpline, alternatePhone,
            email, website, logoUrl, focusAreas, categories,
            supportedCities, requiredDocuments, verificationAuthority
        } = req.body;

        if (!name) return res.status(400).json({ msg: 'NGO name is required' });

        const ngo = new Ngo({
            name,
            subtitle:              subtitle              || '',
            description:           description           || '',
            founderOrLeader:       founderOrLeader       || '',
            city:                  city                  || '',
            address:               address               || '',
            phone:                 phone                 || '',
            helpline:              helpline              || '',
            alternatePhone:        alternatePhone        || '',
            email:                 email                 || '',
            website:               website               || '',
            logoUrl:               logoUrl               || '',
            focusAreas:            Array.isArray(focusAreas)            ? focusAreas            : [],
            categories:            Array.isArray(categories)            ? categories            : [],
            supportedCities:       Array.isArray(supportedCities)       ? supportedCities       : [],
            requiredDocuments:     Array.isArray(requiredDocuments)     ? requiredDocuments     : [],
            verificationAuthority: verificationAuthority || '',
            ownerId:               req.user.id,
            isActive:              true,
            isVerified:            false
        });

        await ngo.save();
        res.status(201).json(ngo);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
};
