/**
 * Document Vault Controller
 * The shared "Documents Room" between a specific client and professional,
 * scoped by engagementId. See models/DocumentVaultItem.js for why this is
 * a separate model from the older single-user models/Document.js.
 */

const DocumentVaultItem = require('../models/DocumentVaultItem');
const CaseEngagement    = require('../models/CaseEngagement');
const fs                = require('fs');
const path              = require('path');

let getSingleFileUrl, classifyFileType;
try {
    const uploadMiddleware = require('../middleware/uploadMiddleware');
    getSingleFileUrl = uploadMiddleware.getSingleFileUrl;
    classifyFileType = uploadMiddleware.classifyFileType;
} catch (e) {
    console.error('[DocumentVault] uploadMiddleware import skipped:', e.message);
}

// Confirms the requesting user is actually one of the two participants on
// this engagement (client, lawyer, or social worker) — every vault route
// needs this same check, so it's centralized here.
async function authorizeOnEngagement(engagementId, userId) {
    const engagement = await CaseEngagement.findById(engagementId);
    if (!engagement) return null;

    const isClient = engagement.clientId?.toString() === userId.toString();
    const isLawyer = engagement.lawyerId?.toString() === userId.toString();
    const isSocialWorker = engagement.socialWorkerId?.toString() === userId.toString();

    if (!isClient && !isLawyer && !isSocialWorker) return null;
    return engagement;
}

// ─────────────────────────────────────────────────────────────
// GET /api/document-vault/:engagementId
// List every file shared in this pairing's Documents Room.
// ─────────────────────────────────────────────────────────────
exports.listVaultFiles = async (req, res) => {
    try {
        const { engagementId } = req.params;
        const engagement = await authorizeOnEngagement(engagementId, req.user.id);
        if (!engagement) {
            return res.status(403).json({ msg: 'Not authorized to view this Document Vault' });
        }

        const files = await DocumentVaultItem.find({ engagementId })
            .populate('uploadedBy', 'name firstName lastName profilePic')
            .sort({ createdAt: -1 });

        res.json({ success: true, files });
    } catch (err) {
        console.error('[listVaultFiles]', err.message);
        res.status(500).json({ msg: 'Server error', error: err.message });
    }
};

// ─────────────────────────────────────────────────────────────
// POST /api/document-vault/:engagementId
// Upload one file (field name 'file') into the shared vault.
// ─────────────────────────────────────────────────────────────
exports.uploadVaultFile = async (req, res) => {
    try {
        const { engagementId } = req.params;
        const engagement = await authorizeOnEngagement(engagementId, req.user.id);
        if (!engagement) {
            return res.status(403).json({ msg: 'Not authorized to upload to this Document Vault' });
        }

        if (!req.file) {
            return res.status(400).json({ msg: 'No file was uploaded. Expected field name "file".' });
        }

        const fileUrl  = typeof getSingleFileUrl === 'function' ? getSingleFileUrl(req) : '';
        const fileType = typeof classifyFileType === 'function'
            ? classifyFileType(req.file.originalname)
            : 'document';

        const item = await DocumentVaultItem.create({
            engagementId,
            uploadedBy:    req.user.id,
            fileName:      req.file.originalname,
            fileUrl,
            fileType,
            fileSizeBytes: req.file.size || 0
        });

        const populated = await DocumentVaultItem.findById(item._id)
            .populate('uploadedBy', 'name firstName lastName profilePic');

        // Push the new file to the other party instantly via Socket.io —
        // this is the bi-directional real-time sync requirement.
        try {
            const { emitToEngagement } = require('../services/socketService');
            emitToEngagement(engagementId, 'vault:file-added', populated);
        } catch (socketErr) {
            console.error('[uploadVaultFile] Socket emit failed:', socketErr.message);
        }

        res.status(201).json({ success: true, file: populated });
    } catch (err) {
        console.error('[uploadVaultFile]', err.message);
        res.status(500).json({ msg: 'Server error', error: err.message });
    }
};

// ─────────────────────────────────────────────────────────────
// DELETE /api/document-vault/:engagementId/:fileId
// Permanently removes the file from disk + database — disappears
// from both the client's and the professional's view immediately.
// ─────────────────────────────────────────────────────────────
exports.deleteVaultFile = async (req, res) => {
    try {
        const { engagementId, fileId } = req.params;
        const engagement = await authorizeOnEngagement(engagementId, req.user.id);
        if (!engagement) {
            return res.status(403).json({ msg: 'Not authorized to modify this Document Vault' });
        }

        const item = await DocumentVaultItem.findOne({ _id: fileId, engagementId });
        if (!item) {
            return res.status(404).json({ msg: 'File not found in this vault' });
        }

        // Best-effort disk cleanup — a failure here should not block the
        // database record from being removed, since the spec requires the
        // file to disappear from both UIs regardless.
        try {
            if (item.fileUrl && item.fileUrl.startsWith('/documents/')) {
                const diskPath = path.join(__dirname, '..', 'uploads', 'documents', path.basename(item.fileUrl));
                if (fs.existsSync(diskPath)) fs.unlinkSync(diskPath);
            }
        } catch (diskErr) {
            console.error('[deleteVaultFile] Disk cleanup failed:', diskErr.message);
        }

        await DocumentVaultItem.deleteOne({ _id: fileId });

        // Notify the other party instantly so the file disappears from
        // their screen too, matching the "Synced Dual-Deletion" requirement.
        try {
            const { emitToEngagement } = require('../services/socketService');
            emitToEngagement(engagementId, 'vault:file-deleted', { fileId });
        } catch (socketErr) {
            console.error('[deleteVaultFile] Socket emit failed:', socketErr.message);
        }

        res.json({ success: true, msg: 'File deleted from the Document Vault.' });
    } catch (err) {
        console.error('[deleteVaultFile]', err.message);
        res.status(500).json({ msg: 'Server error', error: err.message });
    }
};
