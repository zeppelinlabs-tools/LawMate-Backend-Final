const Post   = require('../models/Post');
const User   = require('../models/User');
const Follow = require('../models/Follow');
const jwt    = require('jsonwebtoken');

// Shared formatter so the main feed, "posts by user", "saved posts",
// "liked posts", and "commented posts" endpoints all return the exact
// same shape FeedPostModel expects on the Flutter side.
function formatPost(post, viewerId, followingSet) {
    const obj         = post.toObject ? post.toObject() : post;
    const likedArray   = obj.likedUsers || [];
    const savedArray    = obj.savedBy || [];
    const commentsArray = obj.comments || [];
    const author        = obj.userId; // populated user object, or raw id if not populated
    const authorIdStr   = (author?._id || obj.userId)?.toString();

    // If this post is a repost, format the embedded original the same
    // way (minus its own nested repost, to avoid unbounded recursion —
    // a repost of a repost still only shows ONE level of embedding,
    // same as how Twitter/Facebook collapse repost chains visually).
    let repostOf = null;
    if (obj.repostOf && typeof obj.repostOf === 'object') {
        const origAuthor = obj.repostOf.userId;
        repostOf = {
            _id:        obj.repostOf._id,
            authorId:   origAuthor?._id || obj.repostOf.userId,
            authorName: origAuthor && typeof origAuthor === 'object'
                ? `${origAuthor.firstName || ''} ${origAuthor.lastName || ''}`.trim() || origAuthor.name || ''
                : '',
            authorRole: (origAuthor && typeof origAuthor === 'object') ? origAuthor.role || '' : '',
            authorPic:  (origAuthor && typeof origAuthor === 'object') ? origAuthor.profilePic || null : null,
            content:    obj.repostOf.content,
            imageUrl:   obj.repostOf.imageUrl || null,
            media:      obj.repostOf.media || [],
            createdAt:  obj.repostOf.createdAt,
        };
    }

    return {
        _id:        obj._id,
        authorId:   author?._id   || obj.userId,
        authorName: author && typeof author === 'object'
            ? `${author.firstName || ''} ${author.lastName || ''}`.trim() || author.name || ''
            : '',
        authorRole: (author && typeof author === 'object') ? author.role || '' : '',
        authorPic:  (author && typeof author === 'object') ? author.profilePic || null : null,
        userId:     author?._id || obj.userId,
        title:      obj.title,
        content:    obj.content,
        imageUrl:   obj.imageUrl || null,
        media:      obj.media || [],
        repostOf:   repostOf,
        repostsCount: obj.repostsCount || 0,
        likes:      obj.likes || 0,
        comments:   commentsArray.length,
        isLiked:    viewerId
            ? likedArray.map((id) => id?.toString()).includes(viewerId.toString())
            : false,
        isSaved:    viewerId
            ? savedArray.map((id) => id?.toString()).includes(viewerId.toString())
            : false,
        isFollowingAuthor: followingSet ? followingSet.has(authorIdStr) : false,
        createdAt:  obj.createdAt,
    };
}

// Pulls the viewer's userId out of the Authorization header if present,
// or null for a guest request. Used by every feed-family endpoint that
// needs to know "is this viewer's own like/save/comment on this post".
function getViewerId(req) {
    const authHeader = req.header('Authorization');
    if (!authHeader) return null;
    try {
        const token   = authHeader.replace('Bearer ', '');
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
        return decoded.user?.id || decoded.id || null;
    } catch (e) {
        return null;
    }
}

// ── GET /api/feed ─────────────────────────────────────────────
// Priority sort: posts from accounts the viewer follows come first
// (each group still sorted newest → oldest), then everyone else,
// also newest → oldest. Guests (no/invalid token) just get the
// normal newest-first timeline since they follow nobody.
exports.getPosts = async (req, res) => {
    try {
        const posts = await Post.find()
            .populate('userId', 'name firstName lastName profilePic role')
            .populate({
                path: 'repostOf',
                populate: { path: 'userId', select: 'name firstName lastName profilePic role' },
            })
            .sort({ createdAt: -1 });

        const userId = getViewerId(req);

        // Build the set of author IDs the viewer follows (empty for guests).
        let followingSet = new Set();
        if (userId) {
            const followDocs = await Follow.find({ followerId: userId }).select('followingId');
            followingSet = new Set(followDocs.map(f => f.followingId.toString()));
        }

        const formattedPosts = posts.map(p => {
            const formatted = formatPost(p, userId, followingSet);
            formatted._sortCreatedAt = formatted.createdAt; // used only for the in-memory sort below
            return formatted;
        });

        // Stable priority sort: followed-author posts first, each bucket
        // still newest-first (the original Mongo sort already gave us
        // newest-first overall, so a stable sort here preserves that
        // relative order within each bucket).
        formattedPosts.sort((a, b) => {
            const aFollowed = a.isFollowingAuthor ? 1 : 0;
            const bFollowed = b.isFollowingAuthor ? 1 : 0;
            if (aFollowed !== bFollowed) return bFollowed - aFollowed; // followed first
            return new Date(b._sortCreatedAt) - new Date(a._sortCreatedAt);
        });

        // Strip the internal sort helper field before sending the response.
        formattedPosts.forEach(p => delete p._sortCreatedAt);

        // ?following=true → the "Following" tab: ONLY posts from people
        // the viewer actually follows, not everyone's posts with
        // followed ones merely sorted first. Without a real backend
        // filter, "Following" and "For You" would always show
        // identical content, which is exactly the bug being fixed here.
        const onlyFollowing = req.query.following === 'true';
        const finalPosts = onlyFollowing
            ? formattedPosts.filter(p => p.isFollowingAuthor)
            : formattedPosts;

        res.json(finalPosts);
    } catch (err) {
        console.error('[Feed GET]', err.message);
        res.status(500).send('Server error');
    }
};

// ── POST /api/feed ────────────────────────────────────────────
exports.createPost = async (req, res) => {
    try {
        const { title, content, imageUrl } = req.body;
        // `media` arrives as a JSON string when sent via multipart/form-data
        // (which is how the upload route below sends it after uploading
        // each file) — parse it back into an array of {url, type} objects.
        let media = [];
        if (req.body.media) {
            try {
                media = typeof req.body.media === 'string'
                    ? JSON.parse(req.body.media)
                    : req.body.media;
            } catch (e) {
                media = [];
            }
        }

        if (!content || !content.trim())
            return res.status(400).json({ msg: 'Content is required.' });

        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ msg: 'User not found' });

        const newPost = new Post({
            userId:    user._id,
            title:     (title || '').trim() || 'Post',
            content:   content.trim(),
            imageUrl:  imageUrl  || '',
            media:     Array.isArray(media) ? media : [],
            likes:     0,
            likedUsers: []
        });

        await newPost.save();

        // Return in same format as GET /feed
        const authorName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.name || '';
        res.status(201).json({
            _id:        newPost._id,
            authorId:   user._id,
            authorName,
            authorRole: user.role,
            authorPic:  user.profilePic || null,
            userId:     user._id,
            title:      newPost.title,
            content:    newPost.content,
            imageUrl:   newPost.imageUrl || null,
            media:      newPost.media || [],
            likes:      0,
            comments:   0,
            isLiked:    false,
            isFollowingAuthor: false, // you can't follow yourself
            createdAt:  newPost.createdAt
        });
    } catch (err) {
        console.error('[Feed POST]', err.message);
        res.status(500).send('Server error');
    }
};

// ── POST /api/feed/:id/repost ──────────────────────────────────
// Body: { caption?: string }
// Reposts an existing post to the viewer's own feed — creates a NEW
// Post document (so it shows up, gets liked/commented/saved, exactly
// like any other post) with repostOf pointing at the original, and
// bumps the original's repostsCount. Caption is optional, same as
// resharing with or without your own comment on Facebook/Twitter.
exports.createRepost = async (req, res) => {
    try {
        const { id } = req.params;
        const caption = (req.body.caption || '').trim();

        const original = await Post.findById(id);
        if (!original) return res.status(404).json({ msg: 'Original post not found.' });

        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ msg: 'User not found' });

        const repost = new Post({
            userId:    user._id,
            title:     'Repost',
            content:   caption, // can be empty — a bare reshare with no added comment
            repostOf:  original._id,
            likes:     0,
            likedUsers: [],
        });
        await repost.save();

        original.repostsCount = (original.repostsCount || 0) + 1;
        await original.save();

        const populated = await Post.findById(repost._id)
            .populate('userId', 'name firstName lastName profilePic role')
            .populate({
                path: 'repostOf',
                populate: { path: 'userId', select: 'name firstName lastName profilePic role' },
            });

        res.status(201).json(formatPost(populated, req.user.id, new Set()));
    } catch (err) {
        console.error('[Feed REPOST]', err.message);
        res.status(500).send('Server error');
    }
};

// ── POST /api/feed/upload-media ───────────────────────────────
// Uploads one or more image/video files for a feed post and returns
// their URLs + types, ready to be sent back in the `media` field of
// POST /api/feed. Kept as a separate step (upload, THEN create post)
// so the compose UI can show upload progress/preview before posting,
// and so a failed post submission doesn't mean re-uploading the files.
exports.uploadPostMedia = async (req, res) => {
    try {
        const files = req.files || [];
        if (!files.length) {
            return res.status(400).json({ msg: 'No files received.' });
        }

        const { classifyFileType } = require('../middleware/uploadMiddleware');
        const media = files.map(f => ({
            url:  `/documents/${f.filename}`,
            type: classifyFileType(f.filename) === 'video' ? 'video' : 'image',
        }));

        res.status(201).json({ success: true, media });
    } catch (err) {
        console.error('[Feed UPLOAD MEDIA]', err.message);
        res.status(500).json({ msg: 'Server error' });
    }
};

// ── POST /api/feed/:id/like ───────────────────────────────────
exports.likePost = async (req, res) => {
    try {
        const post = await Post.findById(req.params.id);
        if (!post) return res.status(404).json({ msg: 'Post not found' });

        let likedUsers = post.likedUsers || [];
        const userId   = req.user.id;
        const idx      = likedUsers.map(id => id?.toString()).indexOf(userId.toString());

        let isLiked = false;
        if (idx > -1) {
            likedUsers.splice(idx, 1);
            post.likes = Math.max(0, (post.likes || 0) - 1);
        } else {
            likedUsers.push(userId);
            post.likes  = (post.likes || 0) + 1;
            isLiked     = true;
        }

        post.likedUsers = likedUsers;
        await post.save();

        res.json({ likes: post.likes, isLiked });
    } catch (err) {
        console.error('[Feed LIKE]', err.message);
        res.status(500).send('Server error');
    }
};

// ── POST /api/feed/follow/:userId ─────────────────────────────
// Follow another user (lawyer, social_worker, or client). A user
// can never follow themselves; following twice is a harmless no-op.
exports.followUser = async (req, res) => {
    try {
        const targetId = req.params.userId;
        const viewerId = req.user.id;

        if (targetId === viewerId) {
            return res.status(400).json({ msg: 'You cannot follow yourself.' });
        }

        const targetUser = await User.findById(targetId).select('_id');
        if (!targetUser) return res.status(404).json({ msg: 'User not found' });

        await Follow.findOneAndUpdate(
            { followerId: viewerId, followingId: targetId },
            { followerId: viewerId, followingId: targetId },
            { upsert: true, new: true }
        );

        const followerCount = await Follow.countDocuments({ followingId: targetId });
        res.json({ success: true, isFollowing: true, followerCount });
    } catch (err) {
        console.error('[Feed FOLLOW]', err.message);
        res.status(500).send('Server error');
    }
};

// ── DELETE /api/feed/follow/:userId ───────────────────────────
// Unfollow. No-op (still succeeds) if the follow didn't exist.
exports.unfollowUser = async (req, res) => {
    try {
        const targetId = req.params.userId;
        const viewerId = req.user.id;

        await Follow.findOneAndDelete({ followerId: viewerId, followingId: targetId });

        const followerCount = await Follow.countDocuments({ followingId: targetId });
        res.json({ success: true, isFollowing: false, followerCount });
    } catch (err) {
        console.error('[Feed UNFOLLOW]', err.message);
        res.status(500).send('Server error');
    }
};

// ── GET /api/feed/following ───────────────────────────────────
// List of users the CURRENT logged-in user follows, with basic
// profile info populated — used by the "Follows" drawer panel.
exports.getFollowing = async (req, res) => {
    try {
        const viewerId = req.user.id;
        const follows = await Follow.find({ followerId: viewerId })
            .populate('followingId', 'name firstName lastName profilePic role')
            .sort({ createdAt: -1 });

        const list = follows
            .filter(f => f.followingId) // guard against a deleted user leaving a dangling ref
            .map(f => {
                const u = f.followingId;
                return {
                    _id:        u._id,
                    name:       `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.name || '',
                    role:       u.role || '',
                    profilePic: u.profilePic || null,
                };
            });

        res.json(list);
    } catch (err) {
        console.error('[Feed GET FOLLOWING]', err.message);
        res.status(500).send('Server error');
    }
};

// ── GET /api/feed/user/:userId ──────────────────────────────────
// Posts published strictly by one specific user — backs the Feed
// Profile Hub's main "their posts" list, whether viewing your own
// profile or someone else's.
exports.getUserPosts = async (req, res) => {
    try {
        const { userId: targetUserId } = req.params;
        const posts = await Post.find({ userId: targetUserId })
            .populate('userId', 'name firstName lastName profilePic role')
            .populate({
                path: 'repostOf',
                populate: { path: 'userId', select: 'name firstName lastName profilePic role' },
            })
            .sort({ createdAt: -1 });

        const viewerId = getViewerId(req);
        let followingSet = new Set();
        if (viewerId) {
            const followDocs = await Follow.find({ followerId: viewerId }).select('followingId');
            followingSet = new Set(followDocs.map(f => f.followingId.toString()));
        }

        res.json(posts.map(p => formatPost(p, viewerId, followingSet)));
    } catch (err) {
        console.error('[Feed GET USER POSTS]', err.message);
        res.status(500).send('Server error');
    }
};

// ── GET /api/feed/saved ───────────────────────────────────────
// Posts the authenticated viewer has bookmarked/saved.
exports.getSavedPosts = async (req, res) => {
    try {
        const viewerId = getViewerId(req);
        if (!viewerId) return res.status(401).json({ msg: 'Authentication required' });

        const posts = await Post.find({ savedBy: viewerId })
            .populate('userId', 'name firstName lastName profilePic role')
            .populate({
                path: 'repostOf',
                populate: { path: 'userId', select: 'name firstName lastName profilePic role' },
            })
            .sort({ createdAt: -1 });

        res.json(posts.map(p => formatPost(p, viewerId, new Set())));
    } catch (err) {
        console.error('[Feed GET SAVED]', err.message);
        res.status(500).send('Server error');
    }
};

// ── GET /api/feed/liked ───────────────────────────────────────
// Posts the authenticated viewer has liked.
exports.getLikedPosts = async (req, res) => {
    try {
        const viewerId = getViewerId(req);
        if (!viewerId) return res.status(401).json({ msg: 'Authentication required' });

        const posts = await Post.find({ likedUsers: viewerId })
            .populate('userId', 'name firstName lastName profilePic role')
            .populate({
                path: 'repostOf',
                populate: { path: 'userId', select: 'name firstName lastName profilePic role' },
            })
            .sort({ createdAt: -1 });

        res.json(posts.map(p => formatPost(p, viewerId, new Set())));
    } catch (err) {
        console.error('[Feed GET LIKED]', err.message);
        res.status(500).send('Server error');
    }
};

// ── GET /api/feed/commented ───────────────────────────────────
// Posts where the authenticated viewer has left at least one comment.
exports.getCommentedPosts = async (req, res) => {
    try {
        const viewerId = getViewerId(req);
        if (!viewerId) return res.status(401).json({ msg: 'Authentication required' });

        const posts = await Post.find({ 'comments.authorId': viewerId })
            .populate('userId', 'name firstName lastName profilePic role')
            .populate({
                path: 'repostOf',
                populate: { path: 'userId', select: 'name firstName lastName profilePic role' },
            })
            .sort({ createdAt: -1 });

        res.json(posts.map(p => formatPost(p, viewerId, new Set())));
    } catch (err) {
        console.error('[Feed GET COMMENTED]', err.message);
        res.status(500).send('Server error');
    }
};

// ── POST /api/feed/:id/save ───────────────────────────────────
// Toggle save/unsave for one post.
exports.toggleSavePost = async (req, res) => {
    try {
        const viewerId = getViewerId(req);
        if (!viewerId) return res.status(401).json({ msg: 'Authentication required' });

        const post = await Post.findById(req.params.id);
        if (!post) return res.status(404).json({ msg: 'Post not found' });

        const alreadySaved = post.savedBy.map(id => id.toString()).includes(viewerId.toString());
        if (alreadySaved) {
            post.savedBy = post.savedBy.filter(id => id.toString() !== viewerId.toString());
        } else {
            post.savedBy.push(viewerId);
        }
        await post.save();

        res.json({ success: true, isSaved: !alreadySaved });
    } catch (err) {
        console.error('[Feed TOGGLE SAVE]', err.message);
        res.status(500).send('Server error');
    }
};

// ── POST /api/feed/:id/comments ───────────────────────────────
// Add a comment to a post's real comment thread.
exports.addComment = async (req, res) => {
    try {
        const viewerId = getViewerId(req);
        if (!viewerId) return res.status(401).json({ msg: 'Authentication required' });

        const { text } = req.body;
        if (!text || !text.trim()) {
            return res.status(400).json({ msg: 'Comment text is required.' });
        }

        const post = await Post.findById(req.params.id);
        if (!post) return res.status(404).json({ msg: 'Post not found' });

        const author = await User.findById(viewerId).select('firstName lastName name');
        const authorName = author
            ? `${author.firstName || ''} ${author.lastName || ''}`.trim() || author.name || ''
            : '';

        post.comments.push({ authorId: viewerId, authorName, text: text.trim() });
        await post.save();

        res.status(201).json({
            success: true,
            comments: post.comments,
            commentCount: post.comments.length,
        });
    } catch (err) {
        console.error('[Feed ADD COMMENT]', err.message);
        res.status(500).send('Server error');
    }
};

// ── GET /api/feed/profile-stats/:userId ───────────────────────
// Aggregate stats for the Feed Profile Hub header: post count, total
// likes received across all their posts, and follower/following
// counts. All derived from existing Post/Follow data — no new model
// needed.
exports.getProfileStats = async (req, res) => {
    try {
        const { userId } = req.params;

        const posts = await Post.find({ userId }).select('likes');
        const postCount  = posts.length;
        const totalLikes = posts.reduce((sum, p) => sum + (p.likes || 0), 0);

        const followerCount  = await Follow.countDocuments({ followingId: userId });
        const followingCount = await Follow.countDocuments({ followerId: userId });

        res.json({ postCount, totalLikes, followerCount, followingCount });
    } catch (err) {
        console.error('[Feed PROFILE STATS]', err.message);
        res.status(500).send('Server error');
    }
};

// ── DELETE /api/feed/:id ───────────────────────────────────────
// Only the post's own author can delete it — this is the "delete my
// own post" option that should appear instead of a nonsensical
// "follow yourself" option when viewing your own post's menu.
exports.deletePost = async (req, res) => {
    try {
        const { id } = req.params;
        const post = await Post.findById(id);
        if (!post) return res.status(404).json({ msg: 'Post not found.' });

        if (post.userId.toString() !== req.user.id.toString()) {
            return res.status(403).json({ msg: 'You can only delete your own posts.' });
        }

        await Post.findByIdAndDelete(id);
        res.json({ success: true, msg: 'Post deleted.' });
    } catch (err) {
        console.error('[Feed DELETE]', err.message);
        res.status(500).send('Server error');
    }
};
