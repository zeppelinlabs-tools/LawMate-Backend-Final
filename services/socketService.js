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

        socket.on('disconnect', () => {
            console.log(`[Socket] Disconnected: user ${socket.userId} (${socket.id})`);
        });
    });

    console.log('✅ Socket.io server initialized');
    return io;
}

// Called by documentVaultController after a successful upload/delete so
// every other client in that engagement's room gets the update instantly.
function emitToEngagement(engagementId, event, payload) {
    if (!io) {
        console.warn('[Socket] emitToEngagement called before initSocketServer — skipped.');
        return;
    }
    io.to(`engagement:${engagementId}`).emit(event, payload);
}

module.exports = { initSocketServer, emitToEngagement };
