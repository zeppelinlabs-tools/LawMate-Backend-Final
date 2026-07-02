/**
 * Chat Controller
 * Handles AI chatbot session persistence in MongoDB.
 * The actual AI response comes from the external chatbot service
 * (called by Flutter directly). This backend only saves sessions.
 */

const ChatSession  = require('../models/ChatSession');
const ChatMessage  = require('../models/ChatMessage');

// ─────────────────────────────────────────────────────────────
// 1. GET ALL SESSIONS FOR CURRENT USER
// GET /api/chat/sessions
// Returns all chat sessions sorted by lastUpdated (newest first)
// ─────────────────────────────────────────────────────────────
exports.getSessions = async (req, res) => {
    try {
        const sessions = await ChatSession
            .find({ userId: req.user.id })
            .sort({ lastUpdated: -1 })
            .select('_id title lastUpdated createdAt messages');

        res.json(sessions);
    } catch (err) {
        console.error('[Chat getSessions]', err.message);
        res.status(500).send('Server error');
    }
};

// ─────────────────────────────────────────────────────────────
// 2. CREATE NEW SESSION
// POST /api/chat/sessions
// Body: { title? }
// Returns the new empty session
// ─────────────────────────────────────────────────────────────
exports.createSession = async (req, res) => {
    try {
        const session = new ChatSession({
            userId:   req.user.id,
            title:    (req.body.title || 'New Conversation').trim(),
            messages: []
        });
        await session.save();
        res.status(201).json(session);
    } catch (err) {
        console.error('[Chat createSession]', err.message);
        res.status(500).send('Server error');
    }
};

// ─────────────────────────────────────────────────────────────
// 3. ADD MESSAGE TO SESSION
// POST /api/chat/sessions/:sessionId/messages
// Body: { role, text, attachmentType?, attachmentName? }
// Called TWICE per exchange:
//   - Once for user message (role: 'user')
//   - Once for AI reply   (role: 'assistant')
// ─────────────────────────────────────────────────────────────
exports.addMessage = async (req, res) => {
    try {
        const { sessionId } = req.params;
        const { role, text, attachmentType, attachmentName } = req.body;

        if (!role || !['user', 'assistant'].includes(role)) {
            return res.status(400).json({ msg: 'role must be "user" or "assistant"' });
        }

        const session = await ChatSession.findOne({
            _id:    sessionId,
            userId: req.user.id
        });

        if (!session) {
            return res.status(404).json({ msg: 'Session not found' });
        }

        // If a real file was uploaded alongside this message (multer
        // populates req.file when the request is multipart/form-data),
        // save its actual hosted URL — this is what's missing before:
        // attachmentType/attachmentName were always saved as plain
        // labels with no real file behind them.
        let fileUrl = null;
        if (req.file) {
            fileUrl = `/documents/${req.file.filename}`;
        }

        // Add the message
        session.messages.push({
            role,
            text:           text           || '',
            attachmentType: attachmentType || null,
            attachmentName: attachmentName || null,
            fileUrl,
            timestamp:      new Date()
        });

        // Auto-update title from first user message (if still default)
        if (role === 'user' && session.title === 'New Conversation' && text && text.trim()) {
            session.title = text.trim().substring(0, 60);
        }

        await session.save();
        res.json(session);
    } catch (err) {
        console.error('[Chat addMessage]', err.message);
        res.status(500).send('Server error');
    }
};

// ─────────────────────────────────────────────────────────────
// 4. DELETE A SESSION
// DELETE /api/chat/sessions/:sessionId
// ─────────────────────────────────────────────────────────────
exports.deleteSession = async (req, res) => {
    try {
        const session = await ChatSession.findOneAndDelete({
            _id:    req.params.sessionId,
            userId: req.user.id
        });

        if (!session) {
            return res.status(404).json({ msg: 'Session not found' });
        }

        res.json({ msg: 'Session deleted' });
    } catch (err) {
        console.error('[Chat deleteSession]', err.message);
        res.status(500).send('Server error');
    }
};

// ─────────────────────────────────────────────────────────────
// 5. UPDATE SESSION TITLE
// PUT /api/chat/sessions/:sessionId
// Body: { title }
// ─────────────────────────────────────────────────────────────
exports.updateSession = async (req, res) => {
    try {
        const { title } = req.body;
        if (!title || !title.trim()) {
            return res.status(400).json({ msg: 'title is required' });
        }

        const session = await ChatSession.findOneAndUpdate(
            { _id: req.params.sessionId, userId: req.user.id },
            { title: title.trim() },
            { new: true }
        );

        if (!session) {
            return res.status(404).json({ msg: 'Session not found' });
        }

        res.json(session);
    } catch (err) {
        console.error('[Chat updateSession]', err.message);
        res.status(500).send('Server error');
    }
};

// ─────────────────────────────────────────────────────────────
// 6. LEGACY: SEND MESSAGE (kept for backward compatibility)
// POST /api/chat
// ─────────────────────────────────────────────────────────────
exports.sendMessage = async (req, res) => {
    try {
        const messageText = (req.body.message || req.body.content || '').trim();
        if (!messageText) return res.status(400).json({ msg: 'Message is required' });

        if (req.user?.id) {
            await ChatMessage.create({
                message:    messageText,
                senderId:   req.user.id,
                receiverId: req.user.id,
            });
        }

        res.json({ reply: 'Message received.' });
    } catch (err) {
        console.error('[Chat sendMessage]', err.message);
        res.status(500).send('Server error');
    }
};

// ─────────────────────────────────────────────────────────────
// 7. LEGACY: GET HISTORY (kept for backward compatibility)
// GET /api/chat/history
// ─────────────────────────────────────────────────────────────
exports.history = async (req, res) => {
    try {
        const messages = await ChatMessage.find({ senderId: req.user.id })
            .sort({ createdAt: 1 });
        res.json(messages);
    } catch (err) {
        console.error('[Chat history]', err.message);
        res.status(500).send('Server error');
    }
};
