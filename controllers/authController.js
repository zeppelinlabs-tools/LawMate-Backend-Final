const crypto     = require('crypto');
const User       = require('../models/User');
const Otp        = require('../models/Otp');
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const { getFileUrl } = require('../middleware/uploadMiddleware');

// ── Helper: sign JWT ──────────────────────────────────────────
function signToken(userId) {
    return jwt.sign(
        { user: { id: userId } },
        process.env.JWT_SECRET || 'secret',
        { expiresIn: '7d' }
    );
}

// ── Helper: generate 6-digit OTP ─────────────────────────────
function generateOtp() {
    return String(crypto.randomInt(100000, 999999));
}

// ── Helper: validate username format ─────────────────────────
function validateUsername(username) {
    if (!username || !username.trim()) return 'Username is required.';
    const u = username.toLowerCase().trim();
    if (/\s/.test(u))          return 'Username must not contain spaces.';
    if (!/[a-z]/.test(u) || !/[0-9]/.test(u))
        return 'Username must contain both letters and numbers (e.g. ahmed_99, ali.2024).';
    if (!/^[a-z0-9_.@]+$/.test(u))
        return 'Username may only contain letters, numbers, underscores (_), periods (.), and @ symbols.';
    return null;
}

// ── Helper: send OTP (mock — replace with real provider) ──────
async function sendOtp(method, destination, code) {
    // TODO: replace with real email (Nodemailer/SendGrid) or SMS (Twilio)
    console.log(`[OTP] Sending ${code} via ${method} to ${destination}`);
    // In production:
    // if (method === 'email') await emailService.send(destination, code);
    // if (method === 'phone') await smsService.send(destination, code);
}

// ── Helper: surface save errors cleanly ──────────────────────
function handleSaveError(err, res) {
    const usernameErrors = [
        'Username must not contain spaces',
        'Username must contain both letters',
        'Username may only contain letters',
        'Username must contain at least'
    ];
    for (const msg of usernameErrors) {
        if (err.message?.includes(msg)) return res.status(400).json({ msg: err.message });
    }
    if (err.code === 11000) {
        const field = Object.keys(err.keyPattern || {})[0] || 'field';
        if (field === 'username') return res.status(409).json({ msg: 'Username is already taken.' });
        if (field === 'email')    return res.status(409).json({ msg: 'An account with this email already exists.' });
        return res.status(409).json({ msg: `${field} is already taken.` });
    }
    console.error('[AuthController]', err.message);
    res.status(500).send('Server error');
}

// ─────────────────────────────────────────────────────────────
// 1. REGISTER
// POST /api/auth/register
// Supports file uploads for lawyers (barCouncilCard, cnicFrontBack)
// and social workers (ngoRegistration).
// ─────────────────────────────────────────────────────────────
exports.register = async (req, res) => {
    try {
        const {
            firstName, lastName, email, password, role, phone, username,
            dob, gender, barNumber, barCouncil, specialization, yearsExp,
            consultationFee, city, bio, languages, isAvailable, casesHandled,
            workType, organization, fee, helpedCount, verificationMethod
        } = req.body;

        // ── Required fields ───────────────────────────────────
        if (!email || !password)
            return res.status(400).json({ msg: 'Email and password are required.' });

        // ── Username validation ───────────────────────────────
        const usernameError = validateUsername(username);
        if (usernameError) return res.status(400).json({ msg: usernameError });

        const normalizedUsername = username.toLowerCase().trim();

        // ── Global username uniqueness check ──────────────────
        const existingUsername = await User.findOne({ username: normalizedUsername });
        if (existingUsername)
            return res.status(409).json({ msg: 'Username is already taken. Please choose a different one.' });

        // ── Email uniqueness check ────────────────────────────
        const existingEmail = await User.findOne({ email: email.toLowerCase().trim() });
        if (existingEmail)
            return res.status(400).json({ msg: 'An account with this email already exists.' });

        // ── Name validation ───────────────────────────────────
        const cleanFirst = (firstName || '').trim();
        const cleanLast  = (lastName  || '').trim();
        if (!cleanFirst)
            return res.status(400).json({ msg: 'First name is required.' });

        const fullName = `${cleanFirst} ${cleanLast}`.trim();

        // ── Hash password ─────────────────────────────────────
        const hashedPassword = await bcrypt.hash(password, 10);

        // ── Role-based verification defaults ─────────────────
        const userRole      = role || 'client';
        const isVerified    = !['lawyer', 'social_worker'].includes(userRole); // clients verified immediately
        const isActive      = !['lawyer', 'social_worker'].includes(userRole);

        // ── File upload paths (lawyers & social workers) ──────
        const barCouncilCardUrl  = getFileUrl(req, 'barCouncilCard');
        const cnicFrontBackUrl   = getFileUrl(req, 'cnicFrontBack');
        const ngoRegistrationUrl = getFileUrl(req, 'ngoRegistration');

        // ── Bar council enum validation for lawyers ───────────
        const { BAR_COUNCILS } = require('../models/User');
        if (userRole === 'lawyer' && barCouncil && !BAR_COUNCILS.includes(barCouncil)) {
            return res.status(400).json({
                msg: `Invalid bar council. Must be one of: ${BAR_COUNCILS.join(', ')}`
            });
        }

        // ── Create user ───────────────────────────────────────
        const user = new User({
            name:             fullName,
            firstName:        cleanFirst,
            lastName:         cleanLast,
            username:         normalizedUsername,
            email:            email.toLowerCase().trim(),
            password:         hashedPassword,
            role:             userRole,
            phone:            phone            || '',
            dob:              dob              || '',
            gender:           gender           || '',
            city:             city             || '',
            bio:              bio              || '',
            languages:        Array.isArray(languages) ? languages : [],
            isAvailable:      isAvailable !== undefined ? isAvailable : true,

            // Verification state
            isVerified,
            isActive,
            isAccountVerified:  false,
            verificationMethod: verificationMethod || 'email',

            // Lawyer fields
            barNumber:          barNumber         || '',
            barCouncil:         barCouncil        || '',
            barCouncilCardUrl,
            cnicFrontBackUrl,
            specialization:     specialization    || '',
            yearsExp:           yearsExp          || 0,
            consultationFee:    consultationFee   || 0,
            casesHandled:       casesHandled      || 0,

            // Social worker fields
            workType:           workType          || '',
            organization:       organization      || '',
            ngoRegistrationUrl,
            fee:                fee               || 0,
            helpedCount:        helpedCount       || 0
        });

        await user.save();

        // ── Generate + send OTP ───────────────────────────────
        const otpCode  = generateOtp();
        const method   = verificationMethod || 'email';
        const dest     = method === 'phone' ? (phone || '') : email.toLowerCase().trim();

        // Clear any existing OTPs for this user
        await Otp.deleteMany({ userId: user._id });

        await Otp.create({
            userId:    user._id,
            email:     email.toLowerCase().trim(),
            phone:     phone || '',
            code:      otpCode,
            method,
            expiresAt: new Date(Date.now() + 15 * 60 * 1000) // 15 minutes
        });

        await sendOtp(method, dest, otpCode);

        // ── Return response with token (OTP sent for verification) ──
        const userObj = user.toObject();
        delete userObj.password;

        // Issue token immediately so frontend works
        // OTP is also sent for account verification
        const token = signToken(user._id);

        res.status(201).json({
            success: true,
            msg:     `Registration successful. A 6-digit OTP has been sent to your ${method}. Please verify to activate your account.`,
            token,
            userId:  user._id,
            role:    user.role,
            otpSentTo: dest,
            // In development — expose OTP so you can test without email/SMS setup
            ...(process.env.NODE_ENV !== 'production' && { devOtp: otpCode }),
            user:    userObj
        });

    } catch (err) {
        return handleSaveError(err, res);
    }
};

// ─────────────────────────────────────────────────────────────
// 2. VERIFY OTP
// POST /api/auth/verify-otp
// Body: { userId, code }
// ─────────────────────────────────────────────────────────────
exports.verifyOtp = async (req, res) => {
    try {
        const { userId, code } = req.body;

        if (!userId || !code)
            return res.status(400).json({ msg: 'userId and code are required.' });

        const otpRecord = await Otp.findOne({ userId, isUsed: false });

        if (!otpRecord)
            return res.status(404).json({ msg: 'No active OTP found. Please request a new one.' });

        // Check expiry
        if (new Date() > otpRecord.expiresAt)
            return res.status(400).json({ msg: 'OTP has expired. Please request a new one.' });

        // Check code
        if (otpRecord.code !== String(code).trim())
            return res.status(400).json({ msg: 'Invalid OTP code. Please try again.' });

        // Mark OTP as used
        otpRecord.isUsed = true;
        await otpRecord.save();

        // Mark user account as OTP-verified
        const user = await User.findByIdAndUpdate(
            userId,
            { isAccountVerified: true },
            { new: true }
        ).select('-password');

        if (!user) return res.status(404).json({ msg: 'User not found.' });

        // Issue JWT token
        const token = signToken(user._id);

        res.json({
            success: true,
            msg:     'Account verified successfully.',
            token,
            role:    user.role,
            user
        });

    } catch (err) {
        console.error('[verifyOtp]', err.message);
        res.status(500).send('Server error');
    }
};

// ─────────────────────────────────────────────────────────────
// 3. RESEND OTP
// POST /api/auth/resend-otp
// Body: { userId }
// ─────────────────────────────────────────────────────────────
exports.resendOtp = async (req, res) => {
    try {
        const { userId } = req.body;
        if (!userId) return res.status(400).json({ msg: 'userId is required.' });

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ msg: 'User not found.' });

        if (user.isAccountVerified)
            return res.status(400).json({ msg: 'Account is already verified.' });

        // Clear all existing OTPs
        await Otp.deleteMany({ userId });

        // Generate new OTP
        const otpCode = generateOtp();
        const method  = user.verificationMethod || 'email';
        const dest    = method === 'phone' ? (user.phone || '') : user.email;

        await Otp.create({
            userId,
            email:     user.email,
            phone:     user.phone || '',
            code:      otpCode,
            method,
            expiresAt: new Date(Date.now() + 15 * 60 * 1000) // fresh 15 minutes
        });

        await sendOtp(method, dest, otpCode);

        res.json({
            success:   true,
            msg:       `A new OTP has been sent to your ${method}. It expires in 15 minutes.`,
            otpSentTo: dest,
            ...(process.env.NODE_ENV !== 'production' && { devOtp: otpCode })
        });

    } catch (err) {
        console.error('[resendOtp]', err.message);
        res.status(500).send('Server error');
    }
};

// ─────────────────────────────────────────────────────────────
// 4. LOGIN
// POST /api/auth/login
// ─────────────────────────────────────────────────────────────
exports.login = async (req, res) => {
    const { email, password, role } = req.body;
    try {
        if (!email || !password)
            return res.status(400).json({ msg: 'Email and password are required.' });

        const user = await User.findOne({ email: email.toLowerCase().trim() });
        if (!user) return res.status(400).json({ msg: 'Invalid credentials.' });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ msg: 'Invalid credentials.' });
        if (role && user.role !== role)
            return res.status(400).json({ msg: `Please login as ${user.role}.` });

        const token  = signToken(user._id);
        const userObj = user.toObject();
        delete userObj.password;

        res.json({ token, role: user.role, user: userObj });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
};

// ─────────────────────────────────────────────────────────────
// 5. GET CURRENT USER (ME)
// GET /api/auth/me
// ─────────────────────────────────────────────────────────────
exports.me = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password');
        if (!user) return res.status(404).json({ msg: 'User not found.' });
        res.json(user);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
};

// ─────────────────────────────────────────────────────────────
// 6. GOOGLE SYNC
// POST /api/auth/google-sync
// ─────────────────────────────────────────────────────────────
exports.googleSync = async (req, res) => {
    const { email, firstName, lastName, picture } = req.body;
    try {
        if (!email) return res.status(400).json({ msg: 'Email is required for Google sync.' });

        const user = await User.findOne({ email: email.toLowerCase().trim() });

        if (user) {
            const token = signToken(user._id);
            return res.status(200).json({
                success:         true,
                needsOnboarding: false,
                token,
                role:            user.role,
                user: { id: user._id, role: user.role, username: user.username }
            });
        }

        return res.status(200).json({
            success:         true,
            needsOnboarding: true,
            msg:             'Email not registered. Please complete your profile to finish signup.',
            googleData: {
                firstName: (firstName || '').trim(),
                lastName:  (lastName  || '').trim(),
                email:     email.toLowerCase().trim(),
                picture:   (picture   || '').trim()
            }
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
};

// ─────────────────────────────────────────────────────────────
// 7. UPDATE PROFILE
// PUT /api/auth/update-profile
// ─────────────────────────────────────────────────────────────
exports.updateProfile = async (req, res) => {
    try {
        const userId = req.user.id;

        if (req.body.username !== undefined) {
            const usernameError = validateUsername(req.body.username);
            if (usernameError) return res.status(400).json({ msg: usernameError });

            const normalizedUsername = req.body.username.toLowerCase().trim();
            const collision = await User.findOne({ username: normalizedUsername, _id: { $ne: userId } });
            if (collision) {
                return res.status(409).json({
                    error: 'Warning: Username matches an active user account. You must provide a completely unique variation before updates can be authorized.'
                });
            }
            req.body.username = normalizedUsername;
        }

        const allowedFields = [
            'firstName', 'lastName', 'username', 'phone', 'profilePic',
            'dob', 'gender', 'city', 'bio', 'languages', 'isAvailable',
            'barNumber', 'barCouncil', 'specialization', 'yearsExp',
            'consultationFee', 'casesHandled', 'workType', 'organization',
            'fee', 'helpedCount'
        ];

        const updateData = {};
        allowedFields.forEach(field => {
            if (req.body[field] !== undefined) updateData[field] = req.body[field];
        });

        if (updateData.firstName !== undefined || updateData.lastName !== undefined) {
            const existing = await User.findById(userId).select('firstName lastName name');
            const first = (updateData.firstName !== undefined ? updateData.firstName : existing.firstName || '').trim();
            const last  = (updateData.lastName  !== undefined ? updateData.lastName  : existing.lastName  || '').trim();
            updateData.name = `${first} ${last}`.trim() || existing.name;
        }

        const updatedUser = await User.findByIdAndUpdate(
            userId,
            { $set: updateData },
            { new: true, runValidators: true }
        ).select('-password');

        if (!updatedUser) return res.status(404).json({ msg: 'User not found.' });
        res.json({ success: true, user: updatedUser });

    } catch (err) {
        return handleSaveError(err, res);
    }
};
