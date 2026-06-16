const crypto     = require('crypto');
const User       = require('../models/User');
const Otp        = require('../models/Otp');
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');

// Safely require the upload middleware utility
let getFileUrl;
try {
    const uploadMiddleware = require('../middleware/uploadMiddleware');
    getFileUrl = uploadMiddleware.getFileUrl;
} catch (e) {
    console.error("[Auth Setup] uploadMiddleware import skipped:", e.message);
}

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

// ── Helper: send OTP ─────────────────────────────────────────
async function sendOtp(method, destination, code) {
    console.log(`[OTP] Sending ${code} via ${method} to ${destination}`);
}

// ── Helper: Global Error Handler ─────────────────────────────
function handleSaveError(err, res) {
    if (err.code === 11000) {
        const field = Object.keys(err.keyPattern || {})[0] || 'field';
        if (field === 'username') return res.status(409).json({ msg: 'Username is already taken.' });
        if (field === 'email')    return res.status(409).json({ msg: 'An account with this email already exists.' });
        return res.status(409).json({ msg: `${field} is already taken.` });
    }
    console.error('[Auth Error Catch]', err);
    return res.status(500).json({ success: false, msg: 'Internal Server Error', error: err.message });
}

// ─────────────────────────────────────────────────────────────
// 1. REGISTER
// ─────────────────────────────────────────────────────────────
exports.register = async (req, res) => {
    try {
        const {
            firstName, lastName, email, password, role, phone, username,
            dob, gender, barNumber, barCouncil, specialization, yearsExp,
            consultationFee, city, bio, languages, isAvailable, casesHandled,
            workType, organization, fee, helpedCount, verificationMethod
        } = req.body;

        if (!email || !password)
            return res.status(400).json({ msg: 'Email and password are required.' });

        const usernameError = validateUsername(username);
        if (usernameError) return res.status(400).json({ msg: usernameError });

        const normalizedUsername = username.toLowerCase().trim();

        const existingUsername = await User.findOne({ username: normalizedUsername });
        if (existingUsername)
            return res.status(409).json({ msg: 'Username is already taken.' });

        const existingEmail = await User.findOne({ email: email.toLowerCase().trim() });
        if (existingEmail)
            return res.status(400).json({ msg: 'An account with this email already exists.' });

        const cleanFirst = (firstName || '').trim();
        const cleanLast  = (lastName  || '').trim();
        if (!cleanFirst) return res.status(400).json({ msg: 'First name is required.' });

        const fullName = `${cleanFirst} ${cleanLast}`.trim();
        const hashedPassword = await bcrypt.hash(password, 10);

        const userRole   = role || 'client';
        const isVerified = !['lawyer', 'social_worker'].includes(userRole);
        const isActive   = !['lawyer', 'social_worker'].includes(userRole);

        let barCouncilCardUrl  = '';
        let cnicFrontBackUrl   = '';
        let ngoRegistrationUrl = '';

        if (typeof getFileUrl === 'function' && req.files) {
            try {
                if (userRole === 'lawyer') {
                    barCouncilCardUrl = getFileUrl(req, 'barCouncilCard') || '';
                }
                cnicFrontBackUrl   = getFileUrl(req, 'cnicFrontBack') || '';
                ngoRegistrationUrl = getFileUrl(req, 'ngoRegistration') || '';
            } catch (fileErr) {
                console.error("[File Utility Error Handled]", fileErr.message);
            }
        }

        const user = new User({
            name:              fullName,
            firstName:         cleanFirst,
            lastName:          cleanLast,
            username:          normalizedUsername,
            email:             email.toLowerCase().trim(),
            password:          hashedPassword,
            role:              userRole,
            phone:             phone            || '',
            dob:               dob              || '',
            gender:            gender           || '',
            city:              city             || '',
            bio:               bio              || '',
            languages:         Array.isArray(languages) ? languages : [],
            isAvailable:       isAvailable !== undefined ? isAvailable : true,
            isVerified,
            isActive,
            isAccountVerified: false,
            verificationMethod: verificationMethod || 'email',
            barNumber:          barNumber         || '',
            barCouncil:         barCouncil        || '',
            barCouncilCardUrl,
            cnicFrontBackUrl,
            specialization:     specialization    || '',
            yearsExp:           yearsExp          || 0,
            consultationFee:    consultationFee   || 0,
            casesHandled:       casesHandled      || 0,
            workType:           workType          || '',
            organization:       organization      || '',
            ngoRegistrationUrl,
            fee:                fee               || 0,
            helpedCount:        helpedCount       || 0
        });

        await user.save();

        const otpCode  = generateOtp();
        const method   = verificationMethod || 'email';
        const dest     = method === 'phone' ? (phone || '') : email.toLowerCase().trim();

        await Otp.deleteMany({ userId: user._id });

        await Otp.create({
            userId:    user._id,
            email:     email.toLowerCase().trim(),
            phone:     phone || '',
            code:      otpCode,
            method,
            expiresAt: new Date(Date.now() + 15 * 60 * 1000)
        });

        await sendOtp(method, dest, otpCode);

        const userObj = user.toObject();
        delete userObj.password;

        const token = signToken(user._id);

        return res.status(201).json({
            success: true,
            msg:     `Registration successful. An OTP has been sent to your ${method}.`,
            token,
            userId:  user._id,
            role:    user.role,
            otpSentTo: dest,
            ...(process.env.NODE_ENV !== 'production' && { devOtp: otpCode }),
            user:    userObj
        });

    } catch (err) {
        return handleSaveError(err, res);
    }
};

// ─────────────────────────────────────────────────────────────
// 2. VERIFY OTP
// ─────────────────────────────────────────────────────────────
exports.verifyOtp = async (req, res) => {
    try {
        const { userId, code } = req.body;
        if (!userId || !code)
            return res.status(400).json({ msg: 'userId and code are required.' });

        const otpRecord = await Otp.findOne({ userId, isUsed: false });
        if (!otpRecord)
            return res.status(404).json({ msg: 'No active OTP found. Please request a new one.' });

        if (new Date() > otpRecord.expiresAt)
            return res.status(400).json({ msg: 'OTP has expired. Please request a new one.' });

        if (otpRecord.code !== String(code).trim())
            return res.status(400).json({ msg: 'Invalid OTP code. Please try again.' });

        otpRecord.isUsed = true;
        await otpRecord.save();

        const user = await User.findByIdAndUpdate(
            userId,
            { isAccountVerified: true },
            { new: true }
        ).select('-password');

        if (!user) return res.status(404).json({ msg: 'User not found.' });

        const token = signToken(user._id);

        return res.json({
            success: true,
            msg:     'Account verified successfully.',
            token,
            role:    user.role,
            user
        });
    } catch (err) {
        return handleSaveError(err, res);
    }
};

// ─────────────────────────────────────────────────────────────
// 3. RESEND OTP
// ─────────────────────────────────────────────────────────────
exports.resendOtp = async (req, res) => {
    try {
        const { userId } = req.body;
        if (!userId) return res.status(400).json({ msg: 'userId is required.' });

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ msg: 'User not found.' });

        if (user.isAccountVerified)
            return res.status(400).json({ msg: 'Account is already verified.' });

        await Otp.deleteMany({ userId });

        const otpCode = generateOtp();
        const method  = user.verificationMethod || 'email';
        const dest    = method === 'phone' ? (user.phone || '') : user.email;

        await Otp.create({
            userId,
            email:     user.email,
            phone:     user.phone || '',
            code:      otpCode,
            method,
            expiresAt: new Date(Date.now() + 15 * 60 * 1000)
        });

        await sendOtp(method, dest, otpCode);

        return res.json({
            success:   true,
            msg:       `A new OTP has been sent to your ${method}.`,
            otpSentTo: dest,
            ...(process.env.NODE_ENV !== 'production' && { devOtp: otpCode })
        });
    } catch (err) {
        return handleSaveError(err, res);
    }
};

// ─────────────────────────────────────────────────────────────
// 4. LOGIN
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

        return res.json({ token, role: user.role, user: userObj });
    } catch (err) {
        return handleSaveError(err, res);
    }
};

// ─────────────────────────────────────────────────────────────
// 5. GET CURRENT USER (ME)
// ─────────────────────────────────────────────────────────────
exports.me = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password');
        if (!user) return res.status(404).json({ msg: 'User not found.' });
        return res.json(user);
    } catch (err) {
        return handleSaveError(err, res);
    }
};

// ─────────────────────────────────────────────────────────────
// 6. GOOGLE SYNC
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
            msg:             'Email not registered. Please complete profile configuration.',
            googleData: {
                firstName: (firstName || '').trim(),
                lastName:  (lastName  || '').trim(),
                email:     email.toLowerCase().trim(),
                picture:   (picture   || '').trim()
            }
        });
    } catch (err) {
        return handleSaveError(err, res);
    }
};

// ─────────────────────────────────────────────────────────────
// 7. UPDATE PROFILE
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
                return res.status(409).json({ msg: 'Username matches an active user account.' });
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
            { new: true }
        ).select('-password');

        if (!updatedUser) return res.status(404).json({ msg: 'User not found.' });
        return res.json({ success: true, user: updatedUser });

    } catch (err) {
        return handleSaveError(err, res);
    }
};

// ─────────────────────────────────────────────────────────────
// 8. CHANGE PASSWORD
// ─────────────────────────────────────────────────────────────
exports.changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        if (!currentPassword || !newPassword)
            return res.status(400).json({ msg: 'Current and new password are required.' });

        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ msg: 'User not found.' });

        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) return res.status(400).json({ msg: 'Current password is incorrect.' });

        user.password = await bcrypt.hash(newPassword, 10);
        await user.save();

        return res.json({ success: true, msg: 'Password changed successfully.' });
    } catch (err) {
        return handleSaveError(err, res);
    }
};
// ─────────────────────────────────────────────────────────────
// 9. FORGOT PASSWORD
// POST /api/auth/forgot-password
// Body: { email }
// ─────────────────────────────────────────────────────────────
exports.forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ msg: 'Email is required.' });
        const user = await User.findOne({ email: email.toLowerCase().trim() });
        if (!user) return res.status(404).json({ msg: 'No account found with this email.' });
        await Otp.deleteMany({ userId: user._id });
        const otpCode = generateOtp();
        await Otp.create({
            userId: user._id, email: user.email, phone: user.phone || '',
            code: otpCode, method: 'email',
            expiresAt: new Date(Date.now() + 15 * 60 * 1000)
        });
        await sendOtp('email', user.email, otpCode);
        return res.json({
            success: true, msg: 'OTP sent to your email.',
            userId: user._id,
            ...(process.env.NODE_ENV !== 'production' && { devOtp: otpCode })
        });
    } catch (err) { return handleSaveError(err, res); }
};

exports.resetPassword = async (req, res) => {
    try {
        const { userId, code, newPassword } = req.body;
        if (!userId || !code || !newPassword)
            return res.status(400).json({ msg: 'userId, code and newPassword are required.' });
        const otpRecord = await Otp.findOne({ userId, isUsed: false });
        if (!otpRecord) return res.status(404).json({ msg: 'No active OTP found.' });
        if (new Date() > otpRecord.expiresAt) return res.status(400).json({ msg: 'OTP expired.' });
        if (otpRecord.code !== String(code).trim()) return res.status(400).json({ msg: 'Invalid OTP.' });
        otpRecord.isUsed = true;
        await otpRecord.save();
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await User.findByIdAndUpdate(userId, { password: hashedPassword });
        return res.json({ success: true, msg: 'Password reset successfully.' });
    } catch (err) { return handleSaveError(err, res); }
};
