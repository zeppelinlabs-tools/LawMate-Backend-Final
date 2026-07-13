/**
 * Socket.io real-time service.
 *
 * Scope for this first pass: the Document Vault's bi-directional sync
 * (Part 3 of the client-lawyer connection overhaul). Clients join a room
 * named by engagementId and receive 'vault:file-added' / 'vault:file-deleted'
 * events the instant the other party uploads or deletes a file — no
 * polling needed for this specific feature.
 *
 * Auth: the client must send its JWT in the connection handshake
 * (`auth: { token }`), verified with the exact same secret/shape as
 * middleware/authMiddleware.js so there is only one source of truth for
 * what a valid token looks like.
 */

const jwt = require('jsonwebtoken');

let io = null;

function initSocketServer(httpServer) {
    io = require('socket.io')(httpServer, {
        cors: { origin: '*' } // tighten this to your real app origin(s) in production
    });

    io.use((socket, next) => {
        const token = socket.handshake.auth?.token || socket.handshake.query?.token;
        if (!token) {
            return next(new Error('Authentication required'));
        }
        try {
            const decoded = jwt.verify(
                token.toString().replace('Bearer ', ''),
                process.env.JWT_SECRET || 'secret'
            );
            socket.userId = decoded.user?.id;
            if (!socket.userId) return next(new Error('Invalid token payload'));
            next();
        } catch (err) {
            next(new Error('Token is not valid'));
        }
    });

    io.on('connection', (socket) => {
        console.log(`[Socket] Connected: user ${socket.userId} (${socket.id})`);

        // Client explicitly joins the room for one specific engagement —
        // this happens when they open that engagement's Documents Room.
        socket.on('vault:join', (engagementId) => {
            if (!engagementId) return;
            socket.join(`engagement:${engagementId}`);
        });

        socket.on('vault:leave', (engagementId) => {
            if (!engagementId) return;
            socket.leave(`engagement:${engagementId}`);
        });

        // Generic room join/leave, used by the NGO Case Workspace (shared
        // vault, milestone tracker, live chat) and the NGO inquiry chat.
        // roomName is a plain string built by the caller, e.g.
        // `ngocase:<applicationId>` or `ngochat:<applicationId>:inquiry`.
        socket.on('room:join', (roomName) => {
            if (!roomName) return;
            socket.join(roomName);
        });

        socket.on('room:leave', (roomName) => {
            if (!roomName) return;
            socket.leave(roomName);
        });

        socket.on('disconnect', () => {
            console.log(`[Socket] Disconnected: user ${socket.userId} (${socket.id})`);
        });
    });

    console.log('✅ Socket.io server initialized');
    return io;
}

// Generic room broadcast — the NGO Case Workspace and chat features build
// their own room name strings and call this directly, rather than adding
// another engagement-shaped wrapper function per feature.
function emitToRoom(roomName, event, payload) {
    if (!io) {
        console.warn('[Socket] emitToRoom called before initSocketServer — skipped.');
        return;
    }
    io.to(roomName).emit(event, payload);
}

// Called by documentVaultController after a successful upload/delete so
// every other client in that engagement's room gets the update instantly.
function emitToEngagement(engagementId, event, payload) {
    emitToRoom(`engagement:${engagementId}`, event, payload);
}

module.exports = { initSocketServer, emitToEngagement, emitToRoom };
