/**
 * Legal Cases Controller (MongoDB/Mongoose version)
 * Handles: Cases CRUD + Timeline entries + Vault documents
 */

const { LegalCase, CaseTimelineEntry, VaultDocument } = require('../models/LegalCase');
const User = require('../models/User');

// ─── Helper: get timeline + vault for a case ───────────────────
async function populateCase(caseDoc) {
    const timeline = await CaseTimelineEntry.find({ caseId: caseDoc._id }).sort({ createdAt: -1 });
    const vault    = await VaultDocument.find({ caseId: caseDoc._id }).sort({ createdAt: -1 });
    return { ...caseDoc.toObject(), timeline, vault };
}

// ─── GET /api/legal-cases ──────────────────────────────────────
exports.getCases = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ msg: 'User not found' });

        const query = {};
        if (req.query.lawyerId) query.lawyerId = req.query.lawyerId;
        if (req.query.clientId) query.clientId = req.query.clientId;

        if (!query.lawyerId && !query.clientId) {
            if (user.role === 'lawyer' || user.role === 'social_worker') {
                query.lawyerId = user._id;
            } else {
                query.clientId = user._id;
            }
        }

        const cases    = await LegalCase.find(query).sort({ createdAt: -1 });
        const populated = await Promise.all(cases.map(populateCase));
        res.json(populated);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
};

// ─── POST /api/legal-cases ─────────────────────────────────────
// FIX: Added required field validation with clear error messages
exports.createCase = async (req, res) => {
    try {
        // If clientId is a username string (not ObjectId), look up real user
        if (req.body.clientId && !/^[0-9a-fA-F]{24}$/.test(String(req.body.clientId))) {
            const found = await User.findOne({ username: String(req.body.clientId).toLowerCase().trim() });
            if (found) {
                req.body.clientId   = found._id;
                req.body.clientName = `${found.firstName || ''} ${found.lastName || ''}`.trim() || found.username;
            } else {
                return res.status(404).json({ msg: `No user found with username: ${req.body.clientId}` });
            }
        }

        const {
            title, courtName, caseType, caseNumber, caseYear,
            biometricTrackingNumber, clientId, clientName
        } = req.body;

        // Validate required fields clearly
        if (!title || !title.trim()) {
            return res.status(400).json({ msg: 'title is required.' });
        }

        const lawyer = await User.findById(req.user.id);
        if (!lawyer) return res.status(404).json({ msg: 'User not found' });

        // Only lawyers and social workers can create cases
        if (!['lawyer', 'social_worker', 'admin'].includes(lawyer.role)) {
            return res.status(403).json({ msg: 'Only lawyers or social workers can create cases.' });
        }

        const lawyerName = `${lawyer.firstName || ''} ${lawyer.lastName || ''}`.trim()
            || lawyer.username || lawyer.name || 'Lawyer';

        const newCase = new LegalCase({
            title:                   title.trim(),
            courtName:               courtName               || '',
            caseType:                caseType                || '',
            caseNumber:              caseNumber              || '',
            caseYear:                caseYear                || '',
            biometricTrackingNumber: biometricTrackingNumber || '',
            status:                  'Ongoing',
            lawyerId:                req.user.id,
            lawyerName,
            clientId:                clientId   || null,
            clientName:              clientName || ''
        });

        await newCase.save();
        const result = await populateCase(newCase);
        res.status(201).json(result);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server error', error: err.message });
    }
};

// ─── GET /api/legal-cases/:id ──────────────────────────────────
exports.getCase = async (req, res) => {
    try {
        const legalCase = await LegalCase.findById(req.params.id);
        if (!legalCase) return res.status(404).json({ msg: 'Case not found' });
        const result = await populateCase(legalCase);
        res.json(result);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
};

// ─── PUT /api/legal-cases/:id ──────────────────────────────────
exports.updateCase = async (req, res) => {
    try {
        const legalCase = await LegalCase.findById(req.params.id);
        if (!legalCase) return res.status(404).json({ msg: 'Case not found' });

        if (legalCase.lawyerId.toString() !== req.user.id.toString())
            return res.status(403).json({ msg: 'Not authorized' });

        const allowed = [
            'title', 'courtName', 'caseType', 'caseNumber', 'caseYear',
            'biometricTrackingNumber', 'status', 'clientName'
        ];
        allowed.forEach(key => {
            if (req.body[key] !== undefined) legalCase[key] = req.body[key];
        });

        await legalCase.save();
        const result = await populateCase(legalCase);
        res.json(result);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
};

// ─── DELETE /api/legal-cases/:id ──────────────────────────────
exports.deleteCase = async (req, res) => {
    try {
        const legalCase = await LegalCase.findById(req.params.id);
        if (!legalCase) return res.status(404).json({ msg: 'Case not found' });

        if (legalCase.lawyerId.toString() !== req.user.id.toString())
            return res.status(403).json({ msg: 'Not authorized' });

        await CaseTimelineEntry.deleteMany({ caseId: legalCase._id });
        await VaultDocument.deleteMany({ caseId: legalCase._id });
        await legalCase.deleteOne();

        res.json({ msg: 'Case deleted' });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
};

// ─── POST /api/legal-cases/:id/timeline ───────────────────────
exports.addTimelineEntry = async (req, res) => {
    try {
        const legalCase = await LegalCase.findById(req.params.id);
        if (!legalCase) return res.status(404).json({ msg: 'Case not found' });

        if (legalCase.lawyerId.toString() !== req.user.id.toString())
            return res.status(403).json({ msg: 'Not authorized' });

        const { nextHearingDate, stageOfProceeding, presidingJudge, proceedingsRemarks, officialOrders } = req.body;

        const entry = new CaseTimelineEntry({
            caseId:             legalCase._id,
            nextHearingDate:    nextHearingDate ? new Date(nextHearingDate) : null,
            stageOfProceeding:  stageOfProceeding  || '',
            presidingJudge:     presidingJudge     || '',
            proceedingsRemarks: proceedingsRemarks || '',
            officialOrders:     officialOrders     || ''
        });

        await entry.save();
        res.status(201).json(entry);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
};

// ─── POST /api/legal-cases/:id/vault ──────────────────────────
exports.addVaultDocument = async (req, res) => {
    try {
        const legalCase = await LegalCase.findById(req.params.id);
        if (!legalCase) return res.status(404).json({ msg: 'Case not found' });

        if (legalCase.lawyerId.toString() !== req.user.id.toString())
            return res.status(403).json({ msg: 'Not authorized' });

        const { title, fileUrl } = req.body;
        if (!title || !title.trim()) {
            return res.status(400).json({ msg: 'title is required for vault document.' });
        }

        const doc = new VaultDocument({
            caseId:  legalCase._id,
            title:   title.trim(),
            fileUrl: fileUrl || ''
        });

        await doc.save();
        res.status(201).json(doc);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
};
