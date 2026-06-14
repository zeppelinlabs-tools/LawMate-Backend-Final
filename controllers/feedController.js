const Post = require('../models/Post');
const User = require('../models/User');
const jwt  = require('jsonwebtoken');

// ── GET /api/feed ─────────────────────────────────────────────
exports.getPosts = async (req, res) => {
    try {
        const posts = await Post.find()
            .populate('userId', 'name firstName lastName profilePic role')
            .sort({ createdAt: -1 });

        const authHeader = req.header('Authorization');
        let userId = null;
        if (authHeader) {
            try {
                const token   = authHeader.replace('Bearer ', '');
                const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
                userId = decoded.user?.id || decoded.id;
            } catch (e) { /* guest */ }
        }

        // Format response to match FeedPostModel in Flutter
        const formattedPosts = posts.map(p => {
            const obj        = p.toObject();
            const likedArray = obj.likedUsers || [];
            const author     = obj.userId;   // populated user object

            return {
                _id:        obj._id,
                // Flutter FeedPostModel fields
                authorId:   author?._id   || obj.userId,
                authorName: author
                    ? `${author.firstName || ''} ${author.lastName || ''}`.trim() || author.name || ''
                    : '',
                authorRole: author?.role || '',
                authorPic:  author?.profilePic || null,
                // Keep userId for backward compat
                userId:     author?._id || obj.userId,
                title:      obj.title,
                content:    obj.content,
                imageUrl:   obj.imageUrl || null,
                tag:        obj.tag || null,
                likes:      obj.likes || 0,
                comments:   0,
                isLiked:    userId
                    ? likedArray.map((id) => id?.toString()).includes(userId.toString())
                    : false,
                createdAt:  obj.createdAt
            };
        });

        res.json(formattedPosts);
    } catch (err) {
        console.error('[Feed GET]', err.message);
        res.status(500).send('Server error');
    }
};

// ── POST /api/feed ────────────────────────────────────────────
exports.createPost = async (req, res) => {
    try {
        const { title, content, tag, imageUrl } = req.body;

        if (!content || !content.trim())
            return res.status(400).json({ msg: 'Content is required.' });

        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ msg: 'User not found' });

        const newPost = new Post({
            userId:    user._id,
            title:     (title || '').trim() || 'Post',
            content:   content.trim(),
            imageUrl:  imageUrl  || '',
            tag:       tag       || '',
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
            tag:        newPost.tag || null,
            likes:      0,
            comments:   0,
            isLiked:    false,
            createdAt:  newPost.createdAt
        });
    } catch (err) {
        console.error('[Feed POST]', err.message);
        res.status(500).send('Server error');
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
