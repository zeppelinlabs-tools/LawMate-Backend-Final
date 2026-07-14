const { Ngo, NgoApplication, NgoCaseTracking, CaseDocument } = require('../models/Ngo');
const Notification      = require('../models/Notification');
const User               = require('../models/User');
const DocumentVaultItem  = require('../models/DocumentVaultItem');
const fs                 = require('fs');
const path               = require('path');

let getSingleFileUrl, classifyFileType;
try {
    const uploadMiddleware = require('../middleware/uploadMiddleware');
    getSingleFileUrl = uploadMiddleware.getSingleFileUrl;
    classifyFileType = uploadMiddleware.classifyFileType;
} catch (e) {
    console.error('[NgoController] uploadMiddleware import skipped:', e.message);
}

// ── Helper: send notification ───────────────────────────────────
async function notify(userId, type, title, message, actionId = '') {
    try {
        await Notification.create({ userId, type, title, message, actionId, isRead: false });
    } catch (e) {
        console.error('[NGO notify]', e.message);
    }
}

// Builds the milestone list a new case starts with when an application is
// accepted. "Document Collection" is seeded with one concrete sub-step per
// document the applicant actually submitted during intake (rather than a
// single opaque "collect documents" checkbox), so the NGO can verify and
// check off each one individually. The NGO can still add further custom
// sub-steps later from the workspace. A service-type-specific milestone is
// inserted before Resolution for the two tracks where that concretely
// means something beyond "the case was handled" — Financial Aid and Civil
// Identity — everything else just proceeds straight to Resolution.
function buildDefaultMilestones(application) {
    const fileLabel = (url) => {
        const name = (url || '').split(/[/\\]/).pop() || 'document';
        return name.length > 40 ? name.slice(0, 37) + '...' : name;
    };

    const docSubSteps = [];
    if (application.cnicFrontUrl) docSubSteps.push({ label: 'CNIC (front) verified' });
    if (application.cnicBackUrl)  docSubSteps.push({ label: 'CNIC (back) verified' });
    (application.courtDocumentUrls || []).forEach(u =>
        docSubSteps.push({ label: `Court document reviewed: ${fileLabel(u)}` }));
    (application.incomeSlipUrls || []).forEach(u =>
        docSubSteps.push({ label: `Income slip verified: ${fileLabel(u)}` }));
    (application.courtFeeInvoiceUrls || []).forEach(u =>
        docSubSteps.push({ label: `Court fee invoice verified: ${fileLabel(u)}` }));
    (application.supportingFamilyPaperUrls || []).forEach(u =>
        docSubSteps.push({ label: `Supporting document reviewed: ${fileLabel(u)}` }));
    (application.attachedDocuments || []).forEach(u =>
        docSubSteps.push({ label: `Attached document reviewed: ${fileLabel(u)}` }));

    const milestones = [
        { title: 'Application Accepted', status: 'done', date: new Date() },
        { title: 'Initial Consultation', status: 'pending', date: null },
        { title: 'Document Collection',  status: docSubSteps.length ? 'pending' : 'pending', date: null, subSteps: docSubSteps },
        { title: 'Case Filed / Proceeding', status: 'pending', date: null },
    ];

    if (application.serviceType === 'financial_aid') {
        milestones.push({ title: 'Financial Aid Disbursed', status: 'pending', date: null });
    } else if (application.serviceType === 'civil_identity') {
        milestones.push({ title: 'Civil Document Issued', status: 'pending', date: null });
    }

    milestones.push({ title: 'Resolution', status: 'pending', date: null });
    return milestones;
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

        // The Edit Profile sheet had no logo picker at all before — this
        // mirrors the same fix applied to PUT /auth/update-profile: the
        // uploaded file arrives as req.file (uploadNgoLogoSingle, field
        // name 'logo'), not as a URL string in the body.
        if (req.file) {
            try {
                const { getSingleFileUrl } = require('../middleware/uploadMiddleware');
                ngo.logoUrl = getSingleFileUrl(req);
            } catch (e) {
                console.error('[updateMyNgo] Could not resolve uploaded logo URL:', e.message);
            }
        }
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
            applicantMonthlyIncome, caseTitle, caseSummary, description, attachedDocuments,
            cnicFrontUrl, cnicBackUrl, serviceType,
            currentLawyerInfo, courtDocumentUrls,
            employerName, incomeSlipUrls, courtFeeInvoiceUrls,
            missingDocumentType, supportingFamilyPaperUrls
        } = req.body;

        if (!ngoId)        return res.status(400).json({ msg: 'ngoId is required.' });
        if (!caseSummary || !caseSummary.trim())
            return res.status(400).json({ msg: 'Case summary is required.' });
        if (!caseFocusCategory)
            return res.status(400).json({ msg: 'Case focus category is required.' });
        if (!applicantMonthlyIncome)
            return res.status(400).json({ msg: 'Monthly income is required.' });

        const validServiceTypes = ['', 'representation', 'financial_aid', 'mediation', 'civil_identity'];
        if (serviceType && !validServiceTypes.includes(serviceType))
            return res.status(400).json({ msg: 'Invalid serviceType.' });

        const ngo = await Ngo.findById(ngoId);
        if (!ngo) return res.status(404).json({ msg: 'NGO not found.' });
        if (!ngo.isActive)
            return res.status(400).json({ msg: 'This NGO is currently not accepting applications.' });

        // Check for duplicate pending application
        const existing = await NgoApplication.findOne({
            ngoId,
            applicantId: req.user.id,
            status: { $in: ['pending', 'under_review', 'inquiry', 'accepted'] }
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
            caseTitle:              caseTitle              || '',
            caseSummary:            caseSummary.trim(),
            description:            description            || '',
            attachedDocuments:      Array.isArray(attachedDocuments) ? attachedDocuments : [],
            cnicFrontUrl:           cnicFrontUrl           || '',
            cnicBackUrl:            cnicBackUrl            || '',
            serviceType:            serviceType            || '',
            currentLawyerInfo:      currentLawyerInfo      || '',
            courtDocumentUrls:      Array.isArray(courtDocumentUrls) ? courtDocumentUrls : [],
            employerName:           employerName           || '',
            incomeSlipUrls:         Array.isArray(incomeSlipUrls) ? incomeSlipUrls : [],
            courtFeeInvoiceUrls:    Array.isArray(courtFeeInvoiceUrls) ? courtFeeInvoiceUrls : [],
            missingDocumentType:    missingDocumentType    || '',
            supportingFamilyPaperUrls: Array.isArray(supportingFamilyPaperUrls) ? supportingFamilyPaperUrls : [],
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

        // Flatten the populated applicant back into a plain ID string plus
        // an explicit applicantProfilePic field. Previously this left
        // applicantId as the populated object, which silently broke every
        // consumer expecting applicantId to be a plain string (chat
        // participant checks, hasAppliedTo, etc.) and never actually
        // surfaced the profile picture the populate was fetching.
        const result = applications.map(app => {
            const obj = app.toObject();
            const applicant = obj.applicantId;
            obj.applicantId = applicant?._id ? applicant._id.toString() : obj.applicantId;
            obj.applicantProfilePic = applicant?.profilePic || '';
            return obj;
        });

        res.json(result);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
};

// ── PUT /api/ngos/applications/:id/advance ────────────────────────
// Social worker moves an application forward through the pre-decision
// stages of the lifecycle: pending -> under_review -> inquiry. The final
// accept/reject decision still goes through respondToApplication above —
// this endpoint only handles the two forward steps before that decision,
// and specifically opens the temporary Inquiry Chat once the application
// reaches 'inquiry'.
exports.advanceApplicationStatus = async (req, res) => {
    try {
        const { toStatus } = req.body;
        const allowedTargets = ['under_review', 'inquiry'];
        if (!allowedTargets.includes(toStatus))
            return res.status(400).json({ msg: `toStatus must be one of: ${allowedTargets.join(', ')}` });

        const application = await NgoApplication.findById(req.params.id).populate('ngoId');
        if (!application) return res.status(404).json({ msg: 'Application not found.' });

        if (application.ngoId?.ownerId?.toString() !== req.user.id.toString())
            return res.status(403).json({ msg: 'Not authorized.' });

        // Enforce forward-only movement through the lifecycle:
        // pending -> under_review -> inquiry. Cannot skip stages or move
        // backwards, and cannot advance a case that's already been decided.
        const order = { pending: 0, under_review: 1, inquiry: 2 };
        if (!(toStatus in order))
            return res.status(400).json({ msg: 'Invalid target status.' });
        if (!(application.status in order))
            return res.status(400).json({ msg: `Cannot advance — current status is ${application.status}` });
        if (order[toStatus] !== order[application.status] + 1)
            return res.status(400).json({ msg: `Cannot move from ${application.status} directly to ${toStatus}.` });

        application.status    = toStatus;
        application.updatedAt = new Date();
        await application.save();

        if (toStatus === 'inquiry') {
            await notify(
                application.applicantId,
                'connection',
                `💬 Screening Started — ${application.ngoId.name}`,
                `${application.ngoId.name} has opened a screening chat for your application. You can now message them directly.`,
                application._id.toString()
            );
        }

        try {
            const { emitToRoom } = require('../services/socketService');
            emitToRoom(`ngocase:${application._id}`, 'application:status-changed', {
                applicationId: application._id, status: toStatus
            });
        } catch (socketErr) {
            console.error('[NGO Advance] Socket emit failed:', socketErr.message);
        }

        res.json({ success: true, application });
    } catch (err) {
        console.error('[NGO Advance]', err.message);
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

        if (!['pending', 'under_review', 'inquiry'].includes(application.status))
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
                milestones: buildDefaultMilestones(application)
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

            // Real-time: lock the inquiry chat and announce the new case
            // workspace to anyone with either screen open right now.
            try {
                const { emitToRoom } = require('../services/socketService');
                emitToRoom(`ngochat:${application._id}:inquiry`, 'inquiry:closed', {
                    applicationId: application._id, reason: 'accepted'
                });
                emitToRoom(`ngocase:${application._id}`, 'case:opened', {
                    applicationId: application._id, trackingId: tracking._id
                });
            } catch (socketErr) {
                console.error('[NGO Respond] Socket emit failed:', socketErr.message);
            }

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

            try {
                const { emitToRoom } = require('../services/socketService');
                emitToRoom(`ngochat:${application._id}:inquiry`, 'inquiry:closed', {
                    applicationId: application._id, reason: 'rejected'
                });
            } catch (socketErr) {
                console.error('[NGO Respond] Socket emit failed:', socketErr.message);
            }

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

        // Self-heal: some tracking documents (created before ngoUserId was
        // reliably populated, or from an application whose own ngoUserId
        // was unset at the moment it was accepted) can have ngoUserId
        // unset. Previously this crashed with a TypeError on the unguarded
        // .toString() below — caught by the outer try/catch and returned
        // as an opaque 500, which the frontend then showed as an infinite
        // spinner (no error/failure state was ever reached). Repair it
        // from the parent application, once.
        if (!tracking.ngoUserId) {
            const application = await NgoApplication.findById(tracking.applicationId);
            if (application?.ngoUserId) {
                tracking.ngoUserId = application.ngoUserId;
                await tracking.save();
            }
        }

        // Verify the requester is either the client or the NGO worker
        const isClient = tracking.clientId?.toString() === req.user.id.toString();
        const isNgo    = tracking.ngoUserId?.toString() === req.user.id.toString();
        if (!isClient && !isNgo)
            return res.status(403).json({ msg: 'Not authorized.' });

        res.json(tracking);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
};

// ── PUT /api/ngos/case-tracking/:applicationId/milestone ─────────
// NGO marks a milestone as done. Looked up by applicationId (matching
// every other case-tracking endpoint) and by milestone title (matching
// what the frontend actually sends) — previously this looked the tracking
// document up by its own _id (which the frontend never has — it only has
// applicationId, so this always 404'd) and read a milestoneIndex field
// the frontend never sent (so even a correct lookup would have silently
// no-op'd). milestoneIndex is still accepted as a fallback for direct API
// callers that do have it.
exports.updateMilestone = async (req, res) => {
    try {
        const { milestoneIndex, title, status, date } = req.body;
        const tracking = await NgoCaseTracking.findOne({ applicationId: req.params.applicationId });
        if (!tracking) return res.status(404).json({ msg: 'Case not found.' });

        if (!tracking.ngoUserId) {
            const application = await NgoApplication.findById(tracking.applicationId);
            if (application?.ngoUserId) {
                tracking.ngoUserId = application.ngoUserId;
            }
        }
        if (tracking.ngoUserId?.toString() !== req.user.id.toString())
            return res.status(403).json({ msg: 'Not authorized.' });

        let idx = -1;
        if (typeof milestoneIndex === 'number' && milestoneIndex >= 0 && milestoneIndex < tracking.milestones.length) {
            idx = milestoneIndex;
        } else if (title) {
            idx = tracking.milestones.findIndex(m => m.title === title);
        }
        if (idx === -1) return res.status(404).json({ msg: 'Milestone not found on this case.' });

        tracking.milestones[idx].status         = status || 'done';
        tracking.milestones[idx].updatedByNgoAt = new Date();
        if (date) tracking.milestones[idx].date = new Date(date);
        tracking.updatedAt = new Date();
        await tracking.save();

        // Real-time: the client's Milestone Tracker tab updates instantly
        // without needing to poll or re-open the screen.
        try {
            const { emitToRoom } = require('../services/socketService');
            emitToRoom(`ngocase:${tracking.applicationId}`, 'milestone:updated', {
                trackingId: tracking._id, milestones: tracking.milestones
            });
        } catch (socketErr) {
            console.error('[NGO Milestone] Socket emit failed:', socketErr.message);
        }

        // Notify client about milestone update
        const milestone = tracking.milestones[idx];
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

// ── PUT /api/ngos/case-tracking/:applicationId/status ────────────
exports.updateCaseStatus = async (req, res) => {
    try {
        const { status } = req.body;
        const tracking = await NgoCaseTracking.findOne({ applicationId: req.params.applicationId });
        if (!tracking) return res.status(404).json({ msg: 'Case not found.' });

        if (!tracking.ngoUserId) {
            const application = await NgoApplication.findById(tracking.applicationId);
            if (application?.ngoUserId) {
                tracking.ngoUserId = application.ngoUserId;
            }
        }
        if (tracking.ngoUserId?.toString() !== req.user.id.toString())
            return res.status(403).json({ msg: 'Not authorized.' });

        tracking.status    = status;
        tracking.updatedAt = new Date();
        await tracking.save();

        try {
            const { emitToRoom } = require('../services/socketService');
            emitToRoom(`ngocase:${tracking.applicationId}`, 'case:status-updated', {
                trackingId: tracking._id, status
            });
        } catch (socketErr) {
            console.error('[NGO CaseStatus] Socket emit failed:', socketErr.message);
        }

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

// Recomputes a milestone's own status from its sub-steps: done only once
// every sub-step is done. A milestone with zero sub-steps is left exactly
// as-is (that's the plain, directly-toggleable case handled by
// updateMilestone above).
function recomputeMilestoneStatus(milestone) {
    if (!milestone.subSteps || milestone.subSteps.length === 0) return;
    const allDone = milestone.subSteps.every(s => s.isDone);
    milestone.status = allDone ? 'done' : 'pending';
    milestone.updatedByNgoAt = new Date();
}

async function loadOwnedTracking(applicationId, userId) {
    const tracking = await NgoCaseTracking.findOne({ applicationId });
    if (!tracking) return { tracking: null, isClient: false, isNgo: false };
    if (!tracking.ngoUserId) {
        const application = await NgoApplication.findById(tracking.applicationId);
        if (application?.ngoUserId) tracking.ngoUserId = application.ngoUserId;
    }
    const isClient = tracking.clientId?.toString() === userId.toString();
    const isNgo    = tracking.ngoUserId?.toString() === userId.toString();
    return { tracking, isClient, isNgo };
}

// ── POST /api/ngos/case-tracking/:applicationId/milestone/:milestoneIndex/substep/:subStepId/submit ──
// CLIENT ONLY. Client uploads the actual document (or other proof) that
// fulfills this sub-step's requirement — e.g. the income slip file for a
// "Provide income slip" sub-step. This does NOT mark the sub-step done —
// the NGO still has to open it, review the file, and mark it done
// themselves (updateSubStep/toggleSubStep below). Reuses the single-file
// vault uploader (field name 'file'), same as the Shared Vault.
exports.submitSubStepDocument = async (req, res) => {
    try {
        const { tracking, isClient } = await loadOwnedTracking(req.params.applicationId, req.user.id);
        if (!tracking) return res.status(404).json({ msg: 'Case not found.' });
        if (!isClient) return res.status(403).json({ msg: 'Only the client can submit a document for this step.' });

        if (!req.file) return res.status(400).json({ msg: 'No file was uploaded. Expected field name "file".' });

        const idx = parseInt(req.params.milestoneIndex, 10);
        if (isNaN(idx) || idx < 0 || idx >= tracking.milestones.length)
            return res.status(404).json({ msg: 'Milestone not found.' });

        const subStep = tracking.milestones[idx].subSteps.id(req.params.subStepId);
        if (!subStep) return res.status(404).json({ msg: 'Sub-step not found.' });

        subStep.submittedFileUrl  = typeof getSingleFileUrl === 'function' ? getSingleFileUrl(req) : '';
        subStep.submittedFileName = req.file.originalname || '';
        subStep.submittedAt       = new Date();
        // A resubmission (e.g. NGO asked for a clearer copy) reopens the
        // step for re-review rather than staying marked done from a
        // previous, different file.
        subStep.isDone = false;
        tracking.updatedAt = new Date();
        await tracking.save();

        await notify(
            tracking.ngoUserId,
            'case',
            '📎 Client Submitted a Document',
            `A document was submitted for "${tracking.milestones[idx].subSteps.id(req.params.subStepId).label}". Please review it.`,
            tracking.applicationId.toString()
        );

        try {
            const { emitToRoom } = require('../services/socketService');
            emitToRoom(`ngocase:${tracking.applicationId}`, 'milestone:updated', {
                trackingId: tracking._id, milestones: tracking.milestones
            });
        } catch (e) { console.error('[submitSubStepDocument] Socket emit failed:', e.message); }

        res.json({ success: true, tracking });
    } catch (err) {
        console.error('[submitSubStepDocument]', err.message);
        res.status(500).json({ msg: 'Server error' });
    }
};

// ── POST /api/ngos/case-tracking/:applicationId/milestone/:milestoneIndex/substep ──
// NGO adds a custom sub-step to a milestone.
exports.addSubStep = async (req, res) => {
    try {
        const { label } = req.body;
        if (!label || !label.trim()) return res.status(400).json({ msg: 'label is required.' });

        const { tracking, isNgo } = await loadOwnedTracking(req.params.applicationId, req.user.id);
        if (!tracking) return res.status(404).json({ msg: 'Case not found.' });
        if (!isNgo) return res.status(403).json({ msg: 'Not authorized.' });

        const idx = parseInt(req.params.milestoneIndex, 10);
        if (isNaN(idx) || idx < 0 || idx >= tracking.milestones.length)
            return res.status(404).json({ msg: 'Milestone not found.' });

        tracking.milestones[idx].subSteps.push({ label: label.trim() });
        recomputeMilestoneStatus(tracking.milestones[idx]);
        tracking.updatedAt = new Date();
        await tracking.save();

        try {
            const { emitToRoom } = require('../services/socketService');
            emitToRoom(`ngocase:${tracking.applicationId}`, 'milestone:updated', {
                trackingId: tracking._id, milestones: tracking.milestones
            });
        } catch (e) { console.error('[addSubStep] Socket emit failed:', e.message); }

        res.status(201).json({ success: true, tracking });
    } catch (err) {
        console.error('[addSubStep]', err.message);
        res.status(500).json({ msg: 'Server error' });
    }
};

// ── PUT /api/ngos/case-tracking/:applicationId/milestone/:milestoneIndex/substep/:subStepId ──
// NGO toggles a sub-step done/not done — the parent milestone's own status
// is then automatically recomputed from all its sub-steps.
exports.toggleSubStep = async (req, res) => {
    try {
        const { isDone } = req.body;
        const { tracking, isNgo } = await loadOwnedTracking(req.params.applicationId, req.user.id);
        if (!tracking) return res.status(404).json({ msg: 'Case not found.' });
        if (!isNgo) return res.status(403).json({ msg: 'Not authorized.' });

        const idx = parseInt(req.params.milestoneIndex, 10);
        if (isNaN(idx) || idx < 0 || idx >= tracking.milestones.length)
            return res.status(404).json({ msg: 'Milestone not found.' });

        const subStep = tracking.milestones[idx].subSteps.id(req.params.subStepId);
        if (!subStep) return res.status(404).json({ msg: 'Sub-step not found.' });

        subStep.isDone = !!isDone;
        subStep.updatedByNgoAt = new Date();
        recomputeMilestoneStatus(tracking.milestones[idx]);
        tracking.updatedAt = new Date();
        await tracking.save();

        try {
            const { emitToRoom } = require('../services/socketService');
            emitToRoom(`ngocase:${tracking.applicationId}`, 'milestone:updated', {
                trackingId: tracking._id, milestones: tracking.milestones
            });
        } catch (e) { console.error('[toggleSubStep] Socket emit failed:', e.message); }

        res.json({ success: true, tracking });
    } catch (err) {
        console.error('[toggleSubStep]', err.message);
        res.status(500).json({ msg: 'Server error' });
    }
};

// ── DELETE /api/ngos/case-tracking/:applicationId/milestone/:milestoneIndex/substep/:subStepId ──
exports.deleteSubStep = async (req, res) => {
    try {
        const { tracking, isNgo } = await loadOwnedTracking(req.params.applicationId, req.user.id);
        if (!tracking) return res.status(404).json({ msg: 'Case not found.' });
        if (!isNgo) return res.status(403).json({ msg: 'Not authorized.' });

        const idx = parseInt(req.params.milestoneIndex, 10);
        if (isNaN(idx) || idx < 0 || idx >= tracking.milestones.length)
            return res.status(404).json({ msg: 'Milestone not found.' });

        tracking.milestones[idx].subSteps.id(req.params.subStepId)?.deleteOne();
        recomputeMilestoneStatus(tracking.milestones[idx]);
        tracking.updatedAt = new Date();
        await tracking.save();

        try {
            const { emitToRoom } = require('../services/socketService');
            emitToRoom(`ngocase:${tracking.applicationId}`, 'milestone:updated', {
                trackingId: tracking._id, milestones: tracking.milestones
            });
        } catch (e) { console.error('[deleteSubStep] Socket emit failed:', e.message); }

        res.json({ success: true, tracking });
    } catch (err) {
        console.error('[deleteSubStep]', err.message);
        res.status(500).json({ msg: 'Server error' });
    }
};

// ── GET /api/ngos/case-tracking/:applicationId/progress ──────────
// Overall completion percentage across every milestone. A milestone with
// sub-steps contributes (done sub-steps / total sub-steps) toward the
// total; a milestone with none contributes 1 whole unit (done or not).
// This is computed on read rather than stored, so it can never drift out
// of sync with the milestones themselves.
exports.getCaseProgress = async (req, res) => {
    try {
        const { tracking, isClient, isNgo } = await loadOwnedTracking(req.params.applicationId, req.user.id);
        if (!tracking) return res.status(404).json({ msg: 'Case not found.' });
        if (!isClient && !isNgo) return res.status(403).json({ msg: 'Not authorized.' });

        let totalUnits = 0, doneUnits = 0;
        tracking.milestones.forEach(m => {
            if (m.subSteps && m.subSteps.length > 0) {
                totalUnits += m.subSteps.length;
                doneUnits  += m.subSteps.filter(s => s.isDone).length;
            } else {
                totalUnits += 1;
                doneUnits  += m.status === 'done' ? 1 : 0;
            }
        });
        const percent = totalUnits === 0 ? 0 : Math.round((doneUnits / totalUnits) * 100);
        const allMilestonesDone = tracking.milestones.every(m => m.status === 'done');

        res.json({ success: true, percent, totalUnits, doneUnits, allMilestonesDone });
    } catch (err) {
        console.error('[getCaseProgress]', err.message);
        res.status(500).json({ msg: 'Server error' });
    }
};

// ═════════════════════════════════════════════════════════════════
//  Case Document — draft -> pushed -> signed_by_client -> finalized
// ═════════════════════════════════════════════════════════════════

// ── POST /api/ngos/case-tracking/:applicationId/document/generate ──
// NGO only. Only allowed once every milestone is marked done. Creates the
// document as a snapshot of the case at this moment — dateApplied is read
// from the ORIGINAL application, never from "now".
exports.generateCaseDocument = async (req, res) => {
    try {
        const { tracking, isNgo } = await loadOwnedTracking(req.params.applicationId, req.user.id);
        if (!tracking) return res.status(404).json({ msg: 'Case not found.' });
        if (!isNgo) return res.status(403).json({ msg: 'Not authorized.' });

        const allDone = tracking.milestones.every(m => m.status === 'done');
        if (!allDone) return res.status(400).json({ msg: 'All milestones must be completed before generating the case document.' });

        const existing = await CaseDocument.findOne({ applicationId: tracking.applicationId });
        if (existing) return res.status(409).json({ msg: 'A document already exists for this case.', document: existing });

        const [application, ngo, client] = await Promise.all([
            NgoApplication.findById(tracking.applicationId),
            Ngo.findById(tracking.ngoId),
            User.findById(tracking.clientId),
        ]);
        if (!application) return res.status(404).json({ msg: 'Application not found.' });

        const { resolutionSummary, lawyerAssigned, additionalAgreementNotes } = req.body;

        const doc = await CaseDocument.create({
            applicationId: tracking.applicationId,
            ngoId:         tracking.ngoId,
            status:        'draft',

            ngoName:               ngo?.name || '',
            ngoRegistrationNumber: ngo?.registrationNumber || '',
            ngoAddress:            ngo?.headOfficeAddress || ngo?.address || '',
            ngoLogoUrl:            ngo?.logoUrl || '',

            clientName:  application.applicantName || client?.name || '',
            clientCnic:  application.applicantCnic || '',
            clientPhone: application.applicantPhone || '',
            clientEmail: application.applicantEmail || '',

            caseTitle:   application.caseTitle || application.caseFocusCategory || '',
            caseSummary: application.caseSummary || '',
            serviceType: application.serviceType || '',
            referenceId: application.referenceId || '',

            dateApplied: application.createdAt,

            resolutionSummary: resolutionSummary || '',
            lawyerAssigned: lawyerAssigned ? {
                name:               lawyerAssigned.name || '',
                barNumber:          lawyerAssigned.barNumber || '',
                ngoPaysLawyer:      !!lawyerAssigned.ngoPaysLawyer,
                feeArrangementNote: lawyerAssigned.feeArrangementNote || '',
            } : undefined,
            additionalAgreementNotes: additionalAgreementNotes || '',
        });

        res.status(201).json({ success: true, document: doc });
    } catch (err) {
        console.error('[generateCaseDocument]', err.message);
        res.status(500).json({ msg: 'Server error', error: err.message });
    }
};

// ── PUT /api/ngos/case-tracking/:applicationId/document ──────────
// NGO edits the still-draft document before pushing it.
exports.updateCaseDocument = async (req, res) => {
    try {
        const { tracking, isNgo } = await loadOwnedTracking(req.params.applicationId, req.user.id);
        if (!tracking) return res.status(404).json({ msg: 'Case not found.' });
        if (!isNgo) return res.status(403).json({ msg: 'Not authorized.' });

        const doc = await CaseDocument.findOne({ applicationId: tracking.applicationId });
        if (!doc) return res.status(404).json({ msg: 'No document exists for this case yet.' });
        if (doc.status !== 'draft') return res.status(400).json({ msg: 'This document has already been pushed and can no longer be edited.' });

        const editable = ['resolutionSummary', 'additionalAgreementNotes', 'lawyerAssigned'];
        editable.forEach(field => {
            if (req.body[field] !== undefined) doc[field] = req.body[field];
        });
        doc.updatedAt = new Date();
        await doc.save();

        res.json({ success: true, document: doc });
    } catch (err) {
        console.error('[updateCaseDocument]', err.message);
        res.status(500).json({ msg: 'Server error' });
    }
};

// ── GET /api/ngos/case-tracking/:applicationId/document ──────────
// Either party can view it — but the client only once it's actually been
// pushed (a draft is the NGO's own working copy).
exports.getCaseDocument = async (req, res) => {
    try {
        const { tracking, isClient, isNgo } = await loadOwnedTracking(req.params.applicationId, req.user.id);
        if (!tracking) return res.status(404).json({ msg: 'Case not found.' });
        if (!isClient && !isNgo) return res.status(403).json({ msg: 'Not authorized.' });

        const doc = await CaseDocument.findOne({ applicationId: tracking.applicationId });
        if (!doc) return res.status(404).json({ msg: 'No document exists for this case yet.' });
        if (isClient && doc.status === 'draft')
            return res.status(404).json({ msg: 'No document has been shared for this case yet.' });

        res.json({ success: true, document: doc });
    } catch (err) {
        console.error('[getCaseDocument]', err.message);
        res.status(500).json({ msg: 'Server error' });
    }
};

// ── POST /api/ngos/case-tracking/:applicationId/document/push ────
// NGO signs and pushes the draft to the client.
exports.pushCaseDocument = async (req, res) => {
    try {
        const { tracking, isNgo } = await loadOwnedTracking(req.params.applicationId, req.user.id);
        if (!tracking) return res.status(404).json({ msg: 'Case not found.' });
        if (!isNgo) return res.status(403).json({ msg: 'Not authorized.' });

        const { pushNote, ngoSignerName, ngoSignerTitle } = req.body;
        if (!ngoSignerName || !ngoSignerName.trim())
            return res.status(400).json({ msg: 'ngoSignerName is required to sign and push this document.' });

        const doc = await CaseDocument.findOne({ applicationId: tracking.applicationId });
        if (!doc) return res.status(404).json({ msg: 'No document exists for this case yet.' });
        if (doc.status !== 'draft') return res.status(400).json({ msg: 'This document has already been pushed.' });

        doc.status         = 'pushed';
        doc.pushNote        = pushNote || '';
        doc.ngoSignerName   = ngoSignerName.trim();
        doc.ngoSignerTitle  = ngoSignerTitle || '';
        doc.ngoSignedAt     = new Date();
        doc.updatedAt       = new Date();
        await doc.save();

        await notify(
            tracking.clientId,
            'case',
            '📄 Case Document Ready for Your Signature',
            `${doc.ngoName} has shared your case completion document. Please review and sign it.`,
            tracking.applicationId.toString()
        );

        try {
            const { emitToRoom } = require('../services/socketService');
            emitToRoom(`ngocase:${tracking.applicationId}`, 'document:pushed', { document: doc });
        } catch (e) { console.error('[pushCaseDocument] Socket emit failed:', e.message); }

        res.json({ success: true, document: doc });
    } catch (err) {
        console.error('[pushCaseDocument]', err.message);
        res.status(500).json({ msg: 'Server error' });
    }
};

// ── POST /api/ngos/case-tracking/:applicationId/document/sign ────
// Client signs the pushed document.
exports.signCaseDocument = async (req, res) => {
    try {
        const { tracking, isClient } = await loadOwnedTracking(req.params.applicationId, req.user.id);
        if (!tracking) return res.status(404).json({ msg: 'Case not found.' });
        if (!isClient) return res.status(403).json({ msg: 'Not authorized.' });

        const { clientSignerName } = req.body;
        if (!clientSignerName || !clientSignerName.trim())
            return res.status(400).json({ msg: 'clientSignerName is required to sign this document.' });

        const doc = await CaseDocument.findOne({ applicationId: tracking.applicationId });
        if (!doc) return res.status(404).json({ msg: 'No document exists for this case yet.' });
        if (doc.status !== 'pushed')
            return res.status(400).json({ msg: doc.status === 'draft' ? 'This document has not been shared with you yet.' : 'This document has already been signed.' });

        doc.status           = 'signed_by_client';
        doc.clientSignerName = clientSignerName.trim();
        doc.clientSignedAt   = new Date();
        doc.updatedAt        = new Date();
        await doc.save();

        await notify(
            tracking.ngoUserId,
            'case',
            '✍️ Client Signed the Case Document',
            `${doc.clientName} has signed the case document. You can now finalize it.`,
            tracking.applicationId.toString()
        );

        try {
            const { emitToRoom } = require('../services/socketService');
            emitToRoom(`ngocase:${tracking.applicationId}`, 'document:signed', { document: doc });
        } catch (e) { console.error('[signCaseDocument] Socket emit failed:', e.message); }

        res.json({ success: true, document: doc });
    } catch (err) {
        console.error('[signCaseDocument]', err.message);
        res.status(500).json({ msg: 'Server error' });
    }
};

// ── POST /api/ngos/case-tracking/:applicationId/document/finalize ──
// Either party can finalize once the client has signed — this is a
// deliberate separate confirming step, not automatic on signing, so
// either side gets a moment to review the fully-signed document first.
exports.finalizeCaseDocument = async (req, res) => {
    try {
        const { tracking, isClient, isNgo } = await loadOwnedTracking(req.params.applicationId, req.user.id);
        if (!tracking) return res.status(404).json({ msg: 'Case not found.' });
        if (!isClient && !isNgo) return res.status(403).json({ msg: 'Not authorized.' });

        const doc = await CaseDocument.findOne({ applicationId: tracking.applicationId });
        if (!doc) return res.status(404).json({ msg: 'No document exists for this case yet.' });
        if (doc.status !== 'signed_by_client')
            return res.status(400).json({ msg: 'This document cannot be finalized until the client has signed it.' });

        doc.status      = 'finalized';
        doc.finalizedAt = new Date();
        doc.updatedAt   = new Date();
        await doc.save();

        const otherPartyId = isNgo ? tracking.clientId : tracking.ngoUserId;
        await notify(
            otherPartyId,
            'case',
            '✅ Case Document Finalized',
            `The case document for "${doc.caseTitle}" has been finalized and is available to download.`,
            tracking.applicationId.toString()
        );

        try {
            const { emitToRoom } = require('../services/socketService');
            emitToRoom(`ngocase:${tracking.applicationId}`, 'document:finalized', { document: doc });
        } catch (e) { console.error('[finalizeCaseDocument] Socket emit failed:', e.message); }

        res.json({ success: true, document: doc });
    } catch (err) {
        console.error('[finalizeCaseDocument]', err.message);
        res.status(500).json({ msg: 'Server error' });
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

// ── Shared Vault (Case Workspace Tab 2) ─────────────────────────
// Reuses the same DocumentVaultItem collection and real-time pattern
// already built for lawyer/social-worker engagements (see
// documentVaultController.js) — scoped here by applicationId instead of
// engagementId. Kept as separate functions (rather than generalizing
// documentVaultController.js itself) so the already-working engagement
// vault is not touched by this change at all.

// Confirms the requester is either the client or the NGO worker on this
// case, and returns the NgoCaseTracking record if so.
async function authorizeOnCase(applicationId, userId) {
    const tracking = await NgoCaseTracking.findOne({ applicationId });
    if (!tracking) return null;
    const isClient = tracking.clientId?.toString() === userId.toString();
    const isNgo    = tracking.ngoUserId?.toString() === userId.toString();
    if (!isClient && !isNgo) return null;
    return tracking;
}

// ── GET /api/ngos/case-tracking/:applicationId/documents ─────────
exports.listCaseDocuments = async (req, res) => {
    try {
        const { applicationId } = req.params;
        const tracking = await authorizeOnCase(applicationId, req.user.id);
        if (!tracking) return res.status(403).json({ msg: 'Not authorized to view this case\'s documents.' });

        const files = await DocumentVaultItem.find({ applicationId })
            .populate('uploadedBy', 'name firstName lastName profilePic')
            .sort({ createdAt: -1 });

        res.json({ success: true, files });
    } catch (err) {
        console.error('[listCaseDocuments]', err.message);
        res.status(500).json({ msg: 'Server error', error: err.message });
    }
};

// ── POST /api/ngos/case-tracking/:applicationId/documents ────────
// Upload one file (field name 'file') into the case's Shared Vault.
exports.uploadCaseDocument = async (req, res) => {
    try {
        const { applicationId } = req.params;
        const tracking = await authorizeOnCase(applicationId, req.user.id);
        if (!tracking) return res.status(403).json({ msg: 'Not authorized to upload to this case.' });

        if (!req.file) {
            return res.status(400).json({ msg: 'No file was uploaded. Expected field name "file".' });
        }

        const fileUrl  = typeof getSingleFileUrl === 'function' ? getSingleFileUrl(req) : '';
        const fileType = typeof classifyFileType === 'function'
            ? classifyFileType(req.file.originalname)
            : 'document';

        const item = await DocumentVaultItem.create({
            applicationId,
            uploadedBy:    req.user.id,
            fileName:      req.file.originalname,
            fileUrl,
            fileType,
            fileSizeBytes: req.file.size || 0
        });

        const populated = await DocumentVaultItem.findById(item._id)
            .populate('uploadedBy', 'name firstName lastName profilePic');

        try {
            const { emitToRoom } = require('../services/socketService');
            emitToRoom(`ngocase:${applicationId}`, 'vault:file-added', populated);
        } catch (socketErr) {
            console.error('[uploadCaseDocument] Socket emit failed:', socketErr.message);
        }

        res.status(201).json({ success: true, file: populated });
    } catch (err) {
        console.error('[uploadCaseDocument]', err.message);
        res.status(500).json({ msg: 'Server error', error: err.message });
    }
};

// ── DELETE /api/ngos/case-tracking/:applicationId/documents/:fileId ──
// Only the original uploader may delete their own file — a client cannot
// delete an NGO-uploaded file and vice versa.
exports.deleteCaseDocument = async (req, res) => {
    try {
        const { applicationId, fileId } = req.params;
        const tracking = await authorizeOnCase(applicationId, req.user.id);
        if (!tracking) return res.status(403).json({ msg: 'Not authorized to modify this case\'s documents.' });

        const item = await DocumentVaultItem.findOne({ _id: fileId, applicationId });
        if (!item) return res.status(404).json({ msg: 'File not found in this case.' });

        if (item.uploadedBy.toString() !== req.user.id.toString())
            return res.status(403).json({ msg: 'Only the person who uploaded this file can delete it.' });

        try {
            if (item.fileUrl && item.fileUrl.startsWith('/documents/')) {
                const diskPath = path.join(__dirname, '..', 'uploads', 'documents', path.basename(item.fileUrl));
                if (fs.existsSync(diskPath)) fs.unlinkSync(diskPath);
            }
        } catch (diskErr) {
            console.error('[deleteCaseDocument] Disk cleanup failed:', diskErr.message);
        }

        await DocumentVaultItem.deleteOne({ _id: fileId });

        try {
            const { emitToRoom } = require('../services/socketService');
            emitToRoom(`ngocase:${applicationId}`, 'vault:file-deleted', { fileId });
        } catch (socketErr) {
            console.error('[deleteCaseDocument] Socket emit failed:', socketErr.message);
        }

        res.json({ success: true, msg: 'File deleted from the Shared Vault.' });
    } catch (err) {
        console.error('[deleteCaseDocument]', err.message);
        res.status(500).json({ msg: 'Server error', error: err.message });
    }
};
