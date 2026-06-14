/**
 * Chat Routes
 * All routes require JWT authentication.
 *
 * GET    /api/chat/sessions                    → Get all sessions for user
 * POST   /api/chat/sessions                    → Create new session
 * POST   /api/chat/sessions/:sessionId/messages → Add message to session
 * PUT    /api/chat/sessions/:sessionId          → Update session title
 * DELETE /api/chat/sessions/:sessionId          → Delete session
 *
 * Legacy (kept for compatibility):
 * POST   /api/chat          → Send message
 * GET    /api/chat/history  → Get message history
 */

const express = require('express');
const router  = express.Router();
const auth    = require('../middleware/authMiddleware');
const ctrl    = require('../controllers/chatController');

// ── Session endpoints ──────────────────────────────────────────
router.get   ('/sessions',                      auth, ctrl.getSessions);
router.post  ('/sessions',                      auth, ctrl.createSession);
router.post  ('/sessions/:sessionId/messages',  auth, ctrl.addMessage);
router.put   ('/sessions/:sessionId',           auth, ctrl.updateSession);
router.delete('/sessions/:sessionId',           auth, ctrl.deleteSession);

// ── Legacy endpoints ───────────────────────────────────────────
router.post  ('/',         auth, ctrl.sendMessage);
router.get   ('/history',  auth, ctrl.history);

module.exports = router;
