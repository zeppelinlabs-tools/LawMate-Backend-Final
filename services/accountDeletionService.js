/**
 * Account Deletion Service
 *
 * Permanently removes a user and every piece of data tied to them
 * across the whole app — not just the User document itself. Without
 * this, "deleting an account" only ever cleared the device's local
 * session, leaving the real database record, their posts, chat
 * history, connections, etc. completely untouched (which is exactly
 * why deleted accounts kept reappearing everywhere).
 *
 * Two kinds of cleanup happen here:
 *   1. Documents the user OWNS outright get deleted entirely
 *      (their own posts, their own chat sessions, engagements they're
 *      part of, etc.)
 *   2. References to the user INSIDE other people's documents get
 *      pulled out without deleting those documents — e.g. removing
 *      their comment from someone else's post, or their like from a
 *      post's likedUsers array, rather than deleting that whole post.
 */

const mongoose = require('mongoose');

const User            = require('../models/User');
const Post             = require('../models/Post');
const Follow           = require('../models/Follow');
const ChatSession      = require('../models/ChatSession');
const ChatMessage      = require('../models/ChatMessage');
const Notification     = require('../models/Notification');
const CaseEngagement   = require('../models/CaseEngagement');
const Bill             = require('../models/Bill');
const Meeting          = require('../models/Meeting');
const LegalCase        = require('../models/LegalCase');
const Appointment      = require('../models/Appointment');
const Document         = require('../models/Document');
const Otp              = require('../models/Otp');

let DocumentVaultItem;
try {
    DocumentVaultItem = require('../models/DocumentVaultItem');
} catch (e) {
    DocumentVaultItem = null;
}

/**
 * Deletes a user and cascades the deletion across every related
 * collection. Returns a summary of what was removed, mainly useful
 * for logging/debugging — the caller doesn't need to act on it.
 */
async function deleteUserCascade(userId) {
    const uid = new mongoose.Types.ObjectId(userId);
    const summary = {};

    // ── 1. Engagements this user is part of (as client, lawyer, or
    // social worker) — and everything scoped to those engagements:
    // bills, meetings, the 1:1 chat messages, and the shared document
    // vault. These all reference an engagementId, so once we know
    // which engagements involve this user, we can clean up everything
    // underneath them in one pass.
    const engagements = await CaseEngagement.find({
        $or: [{ clientId: uid }, { lawyerId: uid }, { socialWorkerId: uid }],
    }).select('_id');
    const engagementIds = engagements.map(e => e._id);

    if (engagementIds.length > 0) {
        const [billsRes, meetingsRes, msgRes] = await Promise.all([
            Bill.deleteMany({ engagementId: { $in: engagementIds } }),
            Meeting.deleteMany({ engagementId: { $in: engagementIds } }),
            ChatMessage.deleteMany({ engagementId: { $in: engagementIds } }).catch(() => ({ deletedCount: 0 })),
        ]);
        summary.bills = billsRes.deletedCount;
        summary.meetings = meetingsRes.deletedCount;
        summary.chatMessages = msgRes.deletedCount;

        if (DocumentVaultItem) {
            const vaultRes = await DocumentVaultItem.deleteMany({ engagementId: { $in: engagementIds } });
            summary.vaultFiles = vaultRes.deletedCount;
        }
    }
    const engRes = await CaseEngagement.deleteMany({
        $or: [{ clientId: uid }, { lawyerId: uid }, { socialWorkerId: uid }],
    });
    summary.engagements = engRes.deletedCount;

    // ── 2. Legal cases — delete ones this user OWNS (as the lawyer),
    // and just unlink them from cases owned by someone else where
    // they were the client or in the shared-with list (the case
    // itself still belongs to the lawyer and other clients sharing
    // it, so it shouldn't disappear just because one client left).
    const ownCasesRes = await LegalCase.deleteMany({ lawyerId: uid });
    summary.ownLegalCases = ownCasesRes.deletedCount;
    await LegalCase.updateMany(
        { clientId: uid },
        { $unset: { clientId: '', clientName: '' } }
    );
    await LegalCase.updateMany(
        { sharedWithClients: uid },
        { $pull: { sharedWithClients: uid } }
    );

    // ── 3. Appointments involving this user (as client or lawyer).
    const apptRes = await Appointment.deleteMany({ $or: [{ clientId: uid }, { lawyerId: uid }] });
    summary.appointments = apptRes.deletedCount;

    // ── 4. Feed — delete the user's OWN posts entirely (this is the
    // "his data should be deleted with his profile" behavior). For
    // posts belonging to OTHER people, just remove this user's traces
    // (their comments, their like, their save) — those posts and
    // their authors are unaffected.
    const ownPostsRes = await Post.deleteMany({ userId: uid });
    summary.ownPosts = ownPostsRes.deletedCount;

    await Post.updateMany(
        {},
        {
            $pull: {
                likedUsers: uid,
                savedBy: uid,
                comments: { authorId: uid },
            },
        }
    );

    // ── 5. Follow relationships — remove every row where this user is
    // either side of a follow (follower or followed).
    const followRes = await Follow.deleteMany({ $or: [{ followerId: uid }, { followingId: uid }] });
    summary.followRelationships = followRes.deletedCount;

    // ── 6. AI chatbot history — entirely this user's own data, full
    // delete. This is the "every account should have only its own
    // history" fix — these were always correctly scoped by userId on
    // the backend; this just makes sure deleting the account actually
    // clears it rather than leaving orphaned sessions in the database.
    const chatRes = await ChatSession.deleteMany({ userId: uid });
    summary.chatSessions = chatRes.deletedCount;

    // ── 7. Notifications belonging to this user.
    const notifRes = await Notification.deleteMany({ userId: uid });
    summary.notifications = notifRes.deletedCount;

    // ── 8. Single-user generated documents (the document-generator
    // feature's saved output, separate from the shared vault above).
    const docRes = await Document.deleteMany({ userId: uid });
    summary.documents = docRes.deletedCount;

    // ── 9. Any outstanding OTP records for this user.
    const otpRes = await Otp.deleteMany({ userId: uid });
    summary.otps = otpRes.deletedCount;

    // ── 10. Finally, the user document itself.
    await User.findByIdAndDelete(uid);
    summary.userDeleted = true;

    return summary;
}

module.exports = { deleteUserCascade };
