const fs = require('fs/promises');
const path = require('path');
const Document = require('../models/Document');

// 1. GENERATE DOCUMENT & SAVE TO DATABASE
exports.generateDocument = async (req, res) => {
  try {
    const title = (req.body.title || 'Legal Document').trim();
    const content = (req.body.content || '').trim();
    if (!content) return res.status(400).json({ msg: 'Content is required' });

    const fileName = `${Date.now()}_${title.replace(/[^a-z0-9]+/gi, '_')}.txt`;
    const uploadDir = path.join(__dirname, '..', 'uploads', 'documents');
    await fs.mkdir(uploadDir, { recursive: true });
    await fs.writeFile(path.join(uploadDir, fileName), `${title}\n\n${content}`, 'utf8');

    const fileUrl = `/documents/${fileName}`;

    // Aapke Schema ke strictly required fields ko map kar diya:
    const document = new Document({
      userId: req.user.id, 
      title,
      fileName,             // Required check pass
      filePath: fileUrl,    // Required check pass
      fileUrl,              
      type: 'generated',
    });

    await document.save();

    res.json({ 
      id: document._id, 
      fileName: document.fileName,
      filePath: document.filePath, 
      fileUrl: document.fileUrl 
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
};