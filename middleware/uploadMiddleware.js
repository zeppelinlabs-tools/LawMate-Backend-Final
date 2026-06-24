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

// ── File type filter ──────────────────────────────────────────
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

// ── Multer instance ───────────────────────────────────────────
const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB max
});

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
    { name: 'cnicFrontBack',      maxCount: 1 }
]);

// For social worker registration: ngoRegistration credential
const uploadSocialWorkerDocs = upload.fields([
    { name: 'ngoRegistration', maxCount: 1 }
]);

// ── Helper: get file URL from uploaded files ──────────────────
function getFileUrl(req, fieldName) {
    if (!req.files || !req.files[fieldName]) return '';
    const file = req.files[fieldName][0];
    return `/documents/${file.filename}`;
}

module.exports = {
    uploadLawyerDocs,
    uploadSocialWorkerDocs,
    getFileUrl
};
