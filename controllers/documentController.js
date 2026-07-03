const fs = require('fs/promises');
const path = require('path');
const Document = require('../models/Document');

// ── Helper ─────────────────────────────────────────────────────
function generateRefNumber() {
    return `DOC_${Date.now()}`;
}

// ── POST /api/documents/save ───────────────────────────────────
// Saves a filled-in legal document (with all form fields and optional
// signature data) to the user's My Documents. This replaces the old
// /generate endpoint, which only saved a raw .txt blob with no
// structured fields — now the full form data is preserved so the
// document can be re-rendered at any point without data loss.
exports.saveDocument = async (req, res) => {
    try {
        const { title, docType, formFields, signatureData, isSigned } = req.body;

        if (!title || !title.trim()) {
            return res.status(400).json({ msg: 'Document title is required.' });
        }
        if (!formFields || typeof formFields !== 'object') {
            return res.status(400).json({ msg: 'Form fields are required.' });
        }

        const refNumber = generateRefNumber();
        const fileName  = `${refNumber}_${(title || 'document').replace(/[^a-z0-9]+/gi, '_')}.json`;
        const uploadDir = path.join(__dirname, '..', 'uploads', 'documents');

        await fs.mkdir(uploadDir, { recursive: true });

        // Persist a JSON snapshot alongside the DB record so the
        // document is recoverable from file storage if the DB is ever
        // migrated or the record is corrupted.
        const jsonSnapshot = JSON.stringify({
            referenceNumber: refNumber,
            title,
            docType: docType || 'generated',
            formFields,
            isSigned: !!isSigned,
            signedAt: isSigned ? new Date().toISOString() : null,
            createdAt: new Date().toISOString(),
        }, null, 2);
        await fs.writeFile(path.join(uploadDir, fileName), jsonSnapshot, 'utf8');

        const fileUrl = `/documents/${fileName}`;

        const document = new Document({
            userId: req.user.id,
            title: title.trim(),
            docType: docType || 'generated',
            fileName,
            filePath: fileUrl,
            fileUrl,
            formFields,
            signatureData: signatureData || null,
            isSigned:  !!isSigned,
            signedAt:  isSigned ? new Date() : null,
            status:    isSigned ? 'signed' : 'draft',
            referenceNumber: refNumber,
        });

        await document.save();

        res.status(201).json({
            id:              document._id,
            referenceNumber: document.referenceNumber,
            title:           document.title,
            docType:         document.docType,
            fileName:        document.fileName,
            fileUrl:         document.fileUrl,
            formFields:      document.formFields,
            isSigned:        document.isSigned,
            signedAt:        document.signedAt,
            status:          document.status,
            createdAt:       document.createdAt,
        });
    } catch (err) {
        console.error('[Document SAVE]', err.message);
        res.status(500).json({ msg: 'Server error', error: err.message });
    }
};

// ── GET /api/documents ─────────────────────────────────────────
// Lists all documents saved by the logged-in user, newest first.
exports.getMyDocuments = async (req, res) => {
    try {
        const docs = await Document.find({ userId: req.user.id })
            .sort({ createdAt: -1 })
            .select('-signatureData'); // strip the large base64 blob from the list view

        res.json(docs.map(d => ({
            id:              d._id,
            referenceNumber: d.referenceNumber,
            title:           d.title,
            docType:         d.docType,
            fileUrl:         d.fileUrl,
            isSigned:        d.isSigned,
            signedAt:        d.signedAt,
            status:          d.status,
            createdAt:       d.createdAt,
        })));
    } catch (err) {
        console.error('[Document LIST]', err.message);
        res.status(500).json({ msg: 'Server error' });
    }
};

// ── GET /api/documents/:id ─────────────────────────────────────
// Returns a single document including its full formFields and
// signatureData (needed for the preview/re-render screen).
exports.getDocumentById = async (req, res) => {
    try {
        const doc = await Document.findOne({ _id: req.params.id, userId: req.user.id });
        if (!doc) return res.status(404).json({ msg: 'Document not found.' });

        res.json({
            id:              doc._id,
            referenceNumber: doc.referenceNumber,
            title:           doc.title,
            docType:         doc.docType,
            fileUrl:         doc.fileUrl,
            formFields:      doc.formFields,
            signatureData:   doc.signatureData,
            isSigned:        doc.isSigned,
            signedAt:        doc.signedAt,
            status:          doc.status,
            createdAt:       doc.createdAt,
        });
    } catch (err) {
        console.error('[Document GET]', err.message);
        res.status(500).json({ msg: 'Server error' });
    }
};

// ── PUT /api/documents/:id/sign ────────────────────────────────
// Adds a digital signature to an already-saved document, updating its
// status from 'draft' to 'signed'. Accepts the base64 PNG from the
// signature pad canvas on the frontend.
exports.signDocument = async (req, res) => {
    try {
        const { signatureData } = req.body;
        if (!signatureData) {
            return res.status(400).json({ msg: 'Signature data is required.' });
        }

        const doc = await Document.findOne({ _id: req.params.id, userId: req.user.id });
        if (!doc) return res.status(404).json({ msg: 'Document not found.' });

        doc.signatureData = signatureData;
        doc.isSigned  = true;
        doc.signedAt  = new Date();
        doc.status    = 'signed';
        await doc.save();

        res.json({
            id:        doc._id,
            isSigned:  true,
            signedAt:  doc.signedAt,
            status:    doc.status,
        });
    } catch (err) {
        console.error('[Document SIGN]', err.message);
        res.status(500).json({ msg: 'Server error' });
    }
};

// ── DELETE /api/documents/:id ──────────────────────────────────
// Deletes the DB record and the backing JSON file. Only the
// document's owner can delete it.
exports.deleteDocument = async (req, res) => {
    try {
        const doc = await Document.findOne({ _id: req.params.id, userId: req.user.id });
        if (!doc) return res.status(404).json({ msg: 'Document not found.' });

        // Try to remove the JSON file from disk; silently ignore
        // missing-file errors (the record is still deleted regardless).
        try {
            const filePath = path.join(__dirname, '..', 'uploads', 'documents', doc.fileName);
            await fs.unlink(filePath);
        } catch (_) {}

        await Document.findByIdAndDelete(req.params.id);
        res.json({ success: true, msg: 'Document deleted.' });
    } catch (err) {
        console.error('[Document DELETE]', err.message);
        res.status(500).json({ msg: 'Server error' });
    }
};

// ── POST /api/documents/generate (legacy, kept for backward compat) ───
exports.generateDocument = async (req, res) => {
    return exports.saveDocument(req, res);
};
