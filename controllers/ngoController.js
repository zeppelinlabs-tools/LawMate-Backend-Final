const { Ngo, NgoApplication, NgoCaseTracking } = require('../models/Ngo');
const Notification = require('../models/Notification');
const User         = require('../models/User');

// ── Helper: send notification ───────────────────────────────────
async function notify(userId, type, title, message, actionId = '') {
    try {
        await Notification.create({ userId, type, title, message, actionId, isRead: false });
    } catch (e) {
        console.error('[NGO notify]', e.message);
    }
}

// ── GET /api/ngos ────────────────────────────────────────────────
// Lists verified, active NGOs. Each NGO must have been approved by
// admin (isVerified: true) to appear in the client's NGO Hub.
exports.getNgos = async (req, res) => {
    try {
        const query = { isActive: true };
        if (req.query.city && req.query.city !== 'All Cities')
            query.supportedCities = { $in: [new RegExp(req.query.city, 'i')] };
        if (req.query.category)
            query.$or = [
                { focusAreas: req.query.category },
                { categories: req.query.category }
            ];

        const ngos = await Ngo.find(query).sort({ isVerified: -1, createdAt: -1 });
        res.json(ngos);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
};

// ── GET /api/ngos/my ─────────────────────────────────────────────
// Returns the NGO profile for the logged-in social_worker.
exports.getMyNgo = async (req, res) => {
    try {
        const ngo = await Ngo.findOne({ ownerId: req.user.id });
        if (!ngo) return res.status(404).json({ msg: 'No NGO profile found for this account.' });
        res.json(ngo);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
};

// ── PUT /api/ngos/my ─────────────────────────────────────────────
// Update own NGO profile.
exports.updateMyNgo = async (req, res) => {
    try {
        const {
            name, subtitle, description, founderOrLeader, city,
            headOfficeAddress, phone, helpline, alternatePhone, email,
            website, focusAreas, categories, supportedCities
        } = req.body;

        const ngo = await Ngo.findOne({ ownerId: req.user.id });
        if (!ngo) return res.status(404).json({ msg: 'NGO not found.' });

        if (name)              ngo.name              = name.trim();
        if (subtitle)          ngo.subtitle          = subtitle;
        if (description)       ngo.description       = description;
        if (founderOrLeader)   ngo.founderOrLeader   = founderOrLeader;
        if (city)              ngo.city              = city;
        if (headOfficeAddress) ngo.headOfficeAddress = headOfficeAddress;
        if (phone)             ngo.phone             = phone;
        if (helpline)          ngo.helpline          = helpline;
        if (alternatePhone)    ngo.alternatePhone    = alternatePhone;
        if (email)             ngo.email             = email;
        if (website)           ngo.website           = website;
        if (Array.isArray(focusAreas))     ngo.focusAreas     = focusAreas;
        if (Array.isArray(categories))     ngo.categories     = categories;
        if (Array.isArray(supportedCities)) ngo.supportedCities = supportedCities;

        await ngo.save();
        res.json({ success: true, ngo });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
};

// ── GET /api/ngos/:id ────────────────────────────────────────────
exports.getNgo = async (req, res) => {
    try {
        const ngo = await Ngo.findById(req.params.id);
        if (!ngo) return res.status(404).json({ msg: 'NGO not found.' });
        res.json(ngo);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
};

// ── POST /api/ngos/apply ─────────────────────────────────────────
// Client submits an application to an NGO. All mandatory fields must
// be present — the frontend validates before sending, but we also
// validate here for proper rejection with clear messages.
exports.applyToNgo = async (req, res) => {
    try {
        const {
            ngoId, applicantName, applicantPhone, applicantEmail,
            applicantCnic, issueType, caseFocusCategory,
            applicantMonthlyIncome, caseSummary, description, attachedDocuments
        } = req.body;

        if (!ngoId)        return res.status(400).json({ msg: 'ngoId is required.' });
        if (!caseSummary || !caseSummary.trim())
            return res.status(400).json({ msg: 'Case summary is required.' });
        if (!caseFocusCategory)
            return res.status(400).json({ msg: 'Case focus category is required.' });
        if (!applicantMonthlyIncome)
            return res.status(400).json({ msg: 'Monthly income is required.' });

        const ngo = await Ngo.findById(ngoId);
        if (!ngo) return res.status(404).json({ msg: 'NGO not found.' });
        if (!ngo.isActive)
            return res.status(400).json({ msg: 'This NGO is currently not accepting applications.' });

        // Check for duplicate pending application
        const existing = await NgoApplication.findOne({
            ngoId,
            applicantId: req.user.id,
            status: { $in: ['pending', 'under_review', 'accepted'] }
        });
        if (existing)
            return res.status(409).json({
                msg: 'You already have an active application with this NGO.',
                referenceId: existing.referenceId
            });

        const ts = Date.now().toString(16).toUpperCase();
        const referenceId = `LAM-${ts}`;

        const application = new NgoApplication({
            ngoId,
            ngoUserId:              ngo.ownerId,
            applicantId:            req.user.id,
            applicantName:          applicantName          || '',
            applicantPhone:         applicantPhone         || '',
            applicantEmail:         applicantEmail         || '',
            applicantCnic:          applicantCnic          || '',
            issueType:              issueType              || '',
            caseFocusCategory:      caseFocusCategory      || '',
            applicantMonthlyIncome: applicantMonthlyIncome || '',
            caseSummary:            caseSummary.trim(),
            description:            description            || '',
            attachedDocuments:      Array.isArray(attachedDocuments) ? attachedDocuments : [],
            referenceId,
            status: 'pending'
        });

        await application.save();

        // Bump NGO total application count
        await Ngo.findByIdAndUpdate(ngoId, { $inc: { totalApplications: 1 } });

        // Notify the NGO social worker
        if (ngo.ownerId) {
            const client = await User.findById(req.user.id).select('firstName lastName name');
            const clientName = client ? `${client.firstName || ''} ${client.lastName || ''}`.trim() || client.name || 'A client' : 'A client';
            await notify(
                ngo.ownerId,
                'connection',
                `📋 New Application — ${ngo.name}`,
                `${clientName} submitted a case application: "${caseSummary.substring(0, 80)}..."`,
                application._id.toString()
            );
        }

        res.status(201).json({
            success: true,
            msg:     'Application submitted successfully.',
            referenceId,
            status:  'Pending Review',
            applicationId: application._id
        });
    } catch (err) {
        console.error('[NGO Apply]', err.message);
        res.status(500).send('Server error');
    }
};

// ── GET /api/ngos/applications/mine ──────────────────────────────
// Client checks status of their own NGO applications.
exports.getMyApplications = async (req, res) => {
    try {
        const applications = await NgoApplication.find({ applicantId: req.user.id })
            .populate('ngoId', 'name logoUrl city isVerified')
            .sort({ createdAt: -1 });
        res.json(applications);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
};

// ── GET /api/ngos/applications/incoming ──────────────────────────
// Social worker (NGO) views incoming applications.
exports.getIncomingApplications = async (req, res) => {
    try {
        const ngo = await Ngo.findOne({ ownerId: req.user.id });
        if (!ngo) return res.status(404).json({ msg: 'No NGO profile found.' });

        const applications = await NgoApplication.find({ ngoId: ngo._id })
            .populate('applicantId', 'name firstName lastName email phone profilePic')
            .sort({ createdAt: -1 });

        res.json(applications);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
};

// ── PUT /api/ngos/applications/:id/respond ───────────────────────
// Social worker accepts or rejects an application.
// On acceptance, creates a case tracking record automatically.
exports.respondToApplication = async (req, res) => {
    try {
        const { accept, rejectionReason, notes } = req.body;
        const application = await NgoApplication.findById(req.params.id)
            .populate('ngoId')
            .populate('applicantId', 'name firstName lastName email');

        if (!application) return res.status(404).json({ msg: 'Application not found.' });

        // Verify the responder owns this NGO
        if (application.ngoId?.ownerId?.toString() !== req.user.id.toString())
            return res.status(403).json({ msg: 'Not authorized.' });

        if (application.status !== 'pending' && application.status !== 'under_review')
            return res.status(400).json({ msg: `Cannot respond — current status is ${application.status}` });

        const clientName = application.applicantId
            ? `${application.applicantId.firstName || ''} ${application.applicantId.lastName || ''}`.trim() || application.applicantId.name || 'Client'
            : 'Client';

        if (accept) {
            application.status = 'accepted';
            application.notes  = notes || '';
            application.updatedAt = new Date();
            await application.save();

            // Auto-create case tracking
            const tracking = new NgoCaseTracking({
                applicationId: application._id,
                ngoId:         application.ngoId._id,
                clientId:      application.applicantId._id,
                ngoUserId:     req.user.id,
                title:         `${application.caseFocusCategory} — ${clientName}`,
                status:        'open',
                milestones: [
                    { title: 'Application Accepted',    status: 'done',    date: new Date() },
                    { title: 'Initial Consultation',    status: 'pending', date: null },
                    { title: 'Document Collection',     status: 'pending', date: null },
                    { title: 'Case Filed / Proceeding', status: 'pending', date: null },
                    { title: 'Resolution',              status: 'pending', date: null },
                ]
            });
            await tracking.save();

            // Bump NGO accepted cases count
            await Ngo.findByIdAndUpdate(application.ngoId._id, { $inc: { acceptedCases: 1 } });

            // Notify client
            await notify(
                application.applicantId._id,
                'connection',
                `✅ Application Accepted — ${application.ngoId.name}`,
                `Your legal aid application has been accepted. You can now chat with ${application.ngoId.name} and track your case.`,
                application._id.toString()
            );

            res.json({
                success:    true,
                msg:        'Application accepted. Case tracking created.',
                application,
                trackingId: tracking._id
            });
        } else {
            application.status          = 'rejected';
            application.rejectionReason = rejectionReason || '';
            application.updatedAt       = new Date();
            await application.save();

            await notify(
                application.applicantId._id,
                'general',
                `❌ Application Update — ${application.ngoId.name}`,
                rejectionReason
                    ? `Your application was not accepted: ${rejectionReason}`
                    : `Your application could not be accepted at this time.`,
                application._id.toString()
            );

            res.json({ success: true, msg: 'Application rejected.', application });
        }
    } catch (err) {
        console.error('[NGO Respond]', err.message);
        res.status(500).send('Server error');
    }
};

// ── GET /api/ngos/case-tracking/:applicationId ───────────────────
// Get case tracking for a specific accepted application.
exports.getCaseTracking = async (req, res) => {
    try {
        const tracking = await NgoCaseTracking.findOne({
            applicationId: req.params.applicationId
        });
        if (!tracking) return res.status(404).json({ msg: 'Case tracking not found.' });

        // Verify the requester is either the client or the NGO worker
        const isClient = tracking.clientId.toString() === req.user.id.toString();
        const isNgo    = tracking.ngoUserId.toString() === req.user.id.toString();
        if (!isClient && !isNgo)
            return res.status(403).json({ msg: 'Not authorized.' });

        res.json(tracking);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
};

// ── PUT /api/ngos/case-tracking/:id/milestone ────────────────────
// NGO marks a milestone as done.
exports.updateMilestone = async (req, res) => {
    try {
        const { milestoneIndex, status, date } = req.body;
        const tracking = await NgoCaseTracking.findById(req.params.id);
        if (!tracking) return res.status(404).json({ msg: 'Case not found.' });

        if (tracking.ngoUserId.toString() !== req.user.id.toString())
            return res.status(403).json({ msg: 'Not authorized.' });

        if (milestoneIndex >= 0 && milestoneIndex < tracking.milestones.length) {
            tracking.milestones[milestoneIndex].status = status || 'done';
            if (date) tracking.milestones[milestoneIndex].date = new Date(date);
        }
        tracking.updatedAt = new Date();
        await tracking.save();

        // Notify client about milestone update
        const milestone = tracking.milestones[milestoneIndex];
        if (milestone) {
            await notify(
                tracking.clientId,
                'case',
                '📌 Case Milestone Updated',
                `Milestone "${milestone.title}" is now ${milestone.status === 'done' ? 'completed' : 'updated'}.`,
                tracking.applicationId.toString()
            );
        }

        res.json({ success: true, tracking });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
};

// ── PUT /api/ngos/case-tracking/:id/status ───────────────────────
exports.updateCaseStatus = async (req, res) => {
    try {
        const { status } = req.body;
        const tracking = await NgoCaseTracking.findById(req.params.id);
        if (!tracking) return res.status(404).json({ msg: 'Case not found.' });
        if (tracking.ngoUserId.toString() !== req.user.id.toString())
            return res.status(403).json({ msg: 'Not authorized.' });

        tracking.status    = status;
        tracking.updatedAt = new Date();
        await tracking.save();

        await notify(
            tracking.clientId,
            'case',
            '📋 Case Status Updated',
            `Your case status has been updated to: ${status.replace('_', ' ').toUpperCase()}`,
            tracking.applicationId.toString()
        );

        res.json({ success: true, tracking });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
};

// ── GET /api/ngos/:id/applications ───────────────────────────────
// Legacy route — kept for compatibility.
exports.getNgoApplications = async (req, res) => {
    try {
        const ngo = await Ngo.findById(req.params.id);
        if (!ngo) return res.status(404).json({ msg: 'NGO not found.' });
        if (ngo.ownerId?.toString() !== req.user.id.toString())
            return res.status(403).json({ msg: 'Not authorized.' });
        const applications = await NgoApplication.find({ ngoId: ngo._id })
            .populate('applicantId', 'name email phone')
            .sort({ createdAt: -1 });
        res.json(applications);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
};

// ── POST /api/ngos ────────────────────────────────────────────────
// Manually create/seed an NGO (used by admin or seed endpoint).
exports.createNgo = async (req, res) => {
    try {
        const { name, ...rest } = req.body;
        if (!name) return res.status(400).json({ msg: 'NGO name is required.' });
        const ngo = new Ngo({ name, ...rest, ownerId: req.user.id, isActive: true, isVerified: false });
        await ngo.save();
        // Link to user
        await User.findByIdAndUpdate(req.user.id, { ngoId: ngo._id });
        res.status(201).json(ngo);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
};

// ── POST /api/ngos/admin/:id/verify ─────────────────────────────
// Admin verifies an NGO so it appears in the public listing.
exports.verifyNgo = async (req, res) => {
    try {
        const provided = req.headers['x-admin-secret'];
        if (!provided || provided !== process.env.ADMIN_SECRET_KEY)
            return res.status(403).json({ msg: 'Unauthorized.' });

        const ngo = await Ngo.findByIdAndUpdate(
            req.params.id,
            { isVerified: true },
            { new: true }
        );
        if (!ngo) return res.status(404).json({ msg: 'NGO not found.' });

        if (ngo.ownerId) {
            await notify(
                ngo.ownerId,
                'general',
                '✅ NGO Verified',
                `Your organization "${ngo.name}" has been verified and is now visible to clients.`,
            );
        }
        res.json({ success: true, ngo });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
};
