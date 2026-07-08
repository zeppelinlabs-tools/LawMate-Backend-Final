/**
 * Upload Middleware
 * Handles file uploads for lawyer and social worker registration.
 * Files are stored in /uploads/documents/ on disk.
 * File paths are saved to the database.
 *
 * Accepted file types: images (jpg, png) and PDFs only.
 * Max file size: 5MB per file.
 */

const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');

// ── Ensure upload directory exists ────────────────────────────
const uploadDir = path.join(__dirname, '..', 'uploads', 'documents');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// ── Disk storage config ───────────────────────────────────────
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        // Format: timestamp_fieldname_originalname
        const safeName = file.originalname.replace(/[^a-zA-Z0-9.]/g, '_');
        const fileName = `${Date.now()}_${file.fieldname}_${safeName}`;
        cb(null, fileName);
    }
});

// ── File type filter (images + PDF only — lawyer verification docs) ────
const fileFilter = (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|pdf/;
    const extName  = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimeType = allowedTypes.test(file.mimetype);

    if (extName && mimeType) {
        cb(null, true);
    } else {
        cb(new Error('Only JPG, PNG, and PDF files are allowed.'));
    }
};

// ── Wider file type filter (images + PDF + video) — used for connection
// request attachments and the shared Document Vault, where the doc spec
// explicitly calls for video support too. ──────────────────────────────
const mediaFileFilter = (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|pdf|mp4|mov|m4v/;
    const extName  = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimeType = /image|pdf|video/.test(file.mimetype);

    if (extName && mimeType) {
        cb(null, true);
    } else {
        cb(new Error('Only JPG, PNG, PDF, and video files are allowed.'));
    }
};

// ── Multer instance ───────────────────────────────────────────
const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB max
});

// Wider instance for connection-request attachments and the Document
// Vault — these can be videos, which need considerably more headroom
// than the 5MB cap used for lawyer verification documents.
const uploadMedia = multer({
    storage,
    fileFilter: mediaFileFilter,
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB max
});

// Generic single-file uploader — used by the connection-request endpoint,
// which accepts at most one optional attachment under the field name 'attachment'.
const uploadSingleAttachment = uploadMedia.single('attachment');

// Document Vault uploader — one file per request under field name 'file',
// reusing the same wider media filter/size limit.
const uploadVaultFile = uploadMedia.single('file');

// Feed post uploader — up to 6 images/videos per post under field name
// 'files', reusing the same image+video+pdf filter and 50MB-per-file cap
// as the vault/attachment uploaders above.
const uploadFeedMedia = uploadMedia.array('files', 6);

// ── Exported upload configs ───────────────────────────────────

// For lawyer registration: 5 mandatory documents.
// Kept the old 2-field config name available too (uploadLawyerDocsLegacy)
// in case anything else in the codebase still references the old shape,
// but registration now uses this 5-field version.
const uploadLawyerDocs = upload.fields([
    { name: 'licenseCertificate', maxCount: 1 },
    { name: 'cnicFront',          maxCount: 1 },
    { name: 'cnicBack',           maxCount: 1 },
    { name: 'barCouncilFront',    maxCount: 1 },
    { name: 'barCouncilBack',     maxCount: 1 },
    // Legacy field names kept accepted (not required) so any in-flight
    // client build mid-rollout that still sends the old 2-field shape
    // doesn't get a hard 500 from Multer rejecting an unexpected field.
    { name: 'barCouncilCard',     maxCount: 1 },
    { name: 'cnicFrontBack',      maxCount: 1 },
    // Profile picture, optional, for any role signing up through a
    // route that uses this uploader (lawyer, and the plain /register
    // route used by regular client signups). Previously NOT in this
    // list at all — multer rejects any file sent under a field name
    // it wasn't told to expect, so a profile pic picked at signup was
    // either silently dropped (client signup never even tried to send
    // it as multipart) or would have errored outright if it had.
    { name: 'profilePic',         maxCount: 1 }
]);

// For social worker / NGO registration: all required documents + optional profile pic
const uploadSocialWorkerDocs = upload.fields([
    { name: 'ngoRegistration',    maxCount: 1 }, // legacy name kept for backward compat
    { name: 'registrationCert',   maxCount: 1 }, // NGO registration certificate
    { name: 'govtRegistrationDoc',maxCount: 1 }, // Government registration document
    { name: 'profilePic',         maxCount: 1 },
]);

// ── Helper: get file URL from uploaded files ──────────────────
function getFileUrl(req, fieldName) {
    if (!req.files || !req.files[fieldName]) return '';
    const file = req.files[fieldName][0];
    return `/documents/${file.filename}`;
}

// Companion helper for routes using upload.single() instead of
// upload.fields() — req.file (singular) rather than req.files (plural).
function getSingleFileUrl(req) {
    if (!req.file) return '';
    return `/documents/${req.file.filename}`;
}

// Classifies an uploaded file by extension into 'image' | 'video' | 'document',
// matching the three categories the Document Vault and connection-request
// attachment feature both need to tag stored files with.
function classifyFileType(filename) {
    const ext = path.extname(filename || '').toLowerCase();
    if (['.png', '.jpg', '.jpeg'].includes(ext)) return 'image';
    if (['.mp4', '.mov', '.m4v'].includes(ext)) return 'video';
    if (ext === '.pdf') return 'document';
    return 'document';
}

module.exports = {
    uploadLawyerDocs,
    uploadSocialWorkerDocs,
    uploadSingleAttachment,
    uploadVaultFile,
    uploadFeedMedia,
    getFileUrl,
    getSingleFileUrl,
    classifyFileType
};
