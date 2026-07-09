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

const uploadDir = path.join(__dirname, '..', 'uploads', 'documents');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const safeName = file.originalname.replace(/[^a-zA-Z0-9.]/g, '_');
        const fileName = `${Date.now()}_${file.fieldname}_${safeName}`;
        cb(null, fileName);
    }
});

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

const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 }
});

const uploadMedia = multer({
    storage,
    fileFilter: mediaFileFilter,
    limits: { fileSize: 50 * 1024 * 1024 }
});

const uploadSingleAttachment = uploadMedia.single('attachment');
const uploadVaultFile        = uploadMedia.single('file');
const uploadFeedMedia        = uploadMedia.array('files', 6);

const uploadLawyerDocs = upload.fields([
    { name: 'licenseCertificate', maxCount: 1 },
    { name: 'cnicFront',          maxCount: 1 },
    { name: 'cnicBack',           maxCount: 1 },
    { name: 'barCouncilFront',    maxCount: 1 },
    { name: 'barCouncilBack',     maxCount: 1 },
    { name: 'barCouncilCard',     maxCount: 1 },
    { name: 'cnicFrontBack',      maxCount: 1 },
    { name: 'profilePic',         maxCount: 1 },
]);

// Accepts any file field name — so no matter what name the frontend
// uses for registration documents, multer will never reject with
// LIMIT_UNEXPECTED_FILE.
const uploadSocialWorkerDocs = upload.any();

function getFileUrl(req, fieldName) {
    if (!req.files) return '';
    // upload.any() puts files in an array, not an object keyed by field name
    const file = Array.isArray(req.files)
        ? req.files.find(f => f.fieldname === fieldName)
        : (req.files[fieldName] ? req.files[fieldName][0] : null);
    if (!file) return '';
    return `/documents/${file.filename}`;
}

function getSingleFileUrl(req) {
    if (!req.file) return '';
    return `/documents/${req.file.filename}`;
}

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
