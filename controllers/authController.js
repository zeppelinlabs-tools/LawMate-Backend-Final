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
// Real delivery (Brevo for email, Twilio for SMS) lives in
// services/otpDeliveryService.js — see that file for setup details
// and how it safely falls back to console logging if API keys
// aren't configured yet.
const { sendOtp } = require('../services/otpDeliveryService');

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
            workType, organization, fee, helpedCount, verificationMethod,
            // ── New structured lawyer verification fields ───────────────
            provincialBarCouncil, barRegistrationNumber, cnicNumber,
            licenseLevel, isGeneralPractice, areasOfPractice,
            // ── NGO-specific fields (when workType == 'organization') ───
            helpline, alternatePhone, headOfficeAddress, website,
            registrationNumber, verificationAuthority, focusAreas, supportedCities
        } = req.body;

        if (!email || !password)
            return res.status(400).json({ msg: 'Email and password are required.' });

        // If the person chose phone-based verification, a phone number
        // is required — otherwise there's nowhere to actually send the
        // code, and they'd be stuck with no way to verify their account.
        if (verificationMethod === 'phone' && !(phone || '').trim()) {
            return res.status(400).json({
                msg: 'A phone number is required to verify by SMS. Please enter your phone number or choose email verification instead.'
            });
        }

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

        const userRole   = (role === 'user') ? 'user' : (role || 'client');
        const isVerified = !['lawyer', 'social_worker'].includes(userRole);
        const isActive   = !['lawyer', 'social_worker'].includes(userRole);

        let barCouncilCardUrl  = '';
        let cnicFrontBackUrl   = '';
        let ngoRegistrationUrl = '';
        // Resolved below from either an uploaded file (regular signup
        // with a locally-picked image) or a plain URL string already
        // in the request body (e.g. a Google account's photo URL,
        // which isn't a file upload at all). Previously register()
        // never read this from anywhere, so a profile pic picked
        // during signup never made it past the signup screen.
        let profilePicUrl = (req.body.profilePic || '').trim();

        // ── New structured document fields (5 separate files) ───────────────
        let licenseCertificateUrl = '';
        let cnicFrontUrl          = '';
        let cnicBackUrl           = '';
        let barCouncilFrontUrl    = '';
        let barCouncilBackUrl     = '';

        if (typeof getFileUrl === 'function' && req.files) {
            try {
                if (req.files.profilePic) {
                    profilePicUrl = getFileUrl(req, 'profilePic') || profilePicUrl;
                }
                if (userRole === 'lawyer') {
                    // New 5-document set
                    licenseCertificateUrl = getFileUrl(req, 'licenseCertificate') || '';
                    cnicFrontUrl          = getFileUrl(req, 'cnicFront') || '';
                    cnicBackUrl           = getFileUrl(req, 'cnicBack') || '';
                    barCouncilFrontUrl    = getFileUrl(req, 'barCouncilFront') || '';
                    barCouncilBackUrl     = getFileUrl(req, 'barCouncilBack') || '';

                    // Legacy combined fields, still supported for any
                    // in-flight client build mid-rollout.
                    barCouncilCardUrl = getFileUrl(req, 'barCouncilCard') || '';
                }
                cnicFrontBackUrl   = getFileUrl(req, 'cnicFrontBack') || '';
                ngoRegistrationUrl = getFileUrl(req, 'ngoRegistration') || '';
                // NGO registration documents
                if (userRole === 'social_worker') {
                    ngoRegistrationUrl = getFileUrl(req, 'registrationCert') || ngoRegistrationUrl;
                }
            } catch (fileErr) {
                console.error("[File Utility Error Handled]", fileErr.message);
            }
        }

        // ── Lawyer document + CNIC validation ───────────────────────────────
        // Only enforced for the lawyer role — clients and social workers are
        // unaffected. CNIC must be exactly 13 digits once any non-digit
        // formatting characters (dashes, spaces) are stripped, matching the
        // 00000-0000000-0 mask applied client-side.
        if (userRole === 'lawyer') {
            const cleanCnic = (cnicNumber || '').replace(/\D/g, '');
            if (cleanCnic.length !== 13) {
                return res.status(400).json({
                    msg: 'CNIC must be exactly 13 digits (format: 00000-0000000-0).'
                });
            }

            const requiredDocs = {
                licenseCertificate: licenseCertificateUrl,
                cnicFront:          cnicFrontUrl,
                cnicBack:           cnicBackUrl,
                barCouncilFront:    barCouncilFrontUrl,
                barCouncilBack:     barCouncilBackUrl,
            };
            const missingDocs = Object.entries(requiredDocs)
                .filter(([, url]) => !url)
                .map(([field]) => field);

            if (missingDocs.length > 0) {
                return res.status(400).json({
                    msg: `Missing required document(s): ${missingDocs.join(', ')}.`
                });
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

            // ── New structured lawyer verification fields ───────────────
            provincialBarCouncil:  provincialBarCouncil  || '',
            barRegistrationNumber: barRegistrationNumber || '',
            cnicNumber:            (cnicNumber || '').replace(/\D/g, ''),
            licenseLevel:          licenseLevel          || '',
            isGeneralPractice:     isGeneralPractice === true || isGeneralPractice === 'true',
            areasOfPractice:       Array.isArray(areasOfPractice)
                                        ? areasOfPractice
                                        : (typeof areasOfPractice === 'string' && areasOfPractice
                                            ? areasOfPractice.split(',').map(s => s.trim()).filter(Boolean)
                                            : []),
            licenseCertificateUrl,
            cnicFrontUrl,
            cnicBackUrl,
            barCouncilFrontUrl,
            barCouncilBackUrl,
            isVerifiedProfile:  false,

            yearsExp:           yearsExp          || 0,
            consultationFee:    consultationFee   || 0,
            casesHandled:       casesHandled      || 0,
            workType:           workType          || '',
            organization:       organization      || '',
            ngoRegistrationUrl,
            fee:                fee               || 0,
            helpedCount:        helpedCount       || 0,
            profilePic:         profilePicUrl,
            // NGO-specific fields (only meaningful when workType == 'organization')
            helpline:               helpline               || '',
            alternatePhone:         alternatePhone         || '',
            headOfficeAddress:      headOfficeAddress      || '',
            website:                website                || '',
            registrationNumber:     registrationNumber     || '',
            verificationAuthority:  verificationAuthority  || '',
            focusAreas:  Array.isArray(focusAreas)
                            ? focusAreas
                            : (typeof focusAreas === 'string' && focusAreas
                                ? focusAreas.split(',').map(s => s.trim()).filter(Boolean) : []),
            supportedCities: Array.isArray(supportedCities)
                            ? supportedCities
                            : (typeof supportedCities === 'string' && supportedCities
                                ? supportedCities.split(',').map(s => s.trim()).filter(Boolean) : []),
        });

        await user.save();

        // ── Auto-create NGO record for organization social workers ─────────
        // When a social worker registers with workType: 'organization', we
        // automatically create an Ngo record linked to their user account.
        // This is what shows up in the NGO Hub for clients to browse.
        if (userRole === 'social_worker' && workType === 'organization' && organization) {
            try {
                const { Ngo } = require('../models/Ngo');
                const govtDocUrl = (typeof getFileUrl === 'function' && req.files)
                    ? getFileUrl(req, 'govtRegistrationDoc') || ''
                    : '';

                const ngo = new Ngo({
                    name:                  organization.trim(),
                    subtitle:              `${workType === 'organization' ? 'Non-Profit Organization' : 'Social Welfare'}`,
                    description:           bio || '',
                    founderOrLeader:       `${cleanFirst} ${cleanLast}`.trim(),
                    city:                  city || '',
                    headOfficeAddress:     headOfficeAddress || '',
                    address:               headOfficeAddress || city || '',
                    phone:                 phone || '',
                    helpline:              helpline || '',
                    alternatePhone:        alternatePhone || '',
                    email:                 email.toLowerCase().trim(),
                    website:               website || '',
                    logoUrl:               profilePicUrl || '',
                    registrationNumber:    registrationNumber || '',
                    registrationCertUrl:   ngoRegistrationUrl || '',
                    govtRegistrationDocUrl: govtDocUrl,
                    verificationAuthority: verificationAuthority || '',
                    focusAreas:  Array.isArray(focusAreas)
                                    ? focusAreas
                                    : (typeof focusAreas === 'string' && focusAreas
                                        ? focusAreas.split(',').map(s => s.trim()).filter(Boolean) : []),
                    categories:  Array.isArray(focusAreas)
                                    ? focusAreas
                                    : (typeof focusAreas === 'string' && focusAreas
                                        ? focusAreas.split(',').map(s => s.trim()).filter(Boolean) : []),
                    supportedCities: Array.isArray(supportedCities)
                                    ? supportedCities
                                    : (typeof supportedCities === 'string' && supportedCities
                                        ? supportedCities.split(',').map(s => s.trim()).filter(Boolean)
                                        : (city ? [city] : [])),
                    ownerId:    user._id,
                    isActive:   true,
                    isVerified: false, // requires admin verification
                });
                await ngo.save();

                // Link back to user
                user.ngoId = ngo._id;
                await user.save();
            } catch (ngoErr) {
                // Don't fail registration if NGO creation fails — user account still created
                console.error('[Register] Auto-NGO creation failed:', ngoErr.message);
            }
        }

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

        if (method === 'phone' && !dest) {
            return res.status(400).json({
                msg: 'No phone number on file for SMS verification. Please contact support or update your profile with a phone number.'
            });
        }

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
        // Treat 'user' and 'client' as same role
        const normalizedRole = role === 'user' ? 'client' : role;
        const normalizedUserRole = user.role === 'user' ? 'client' : user.role;
        if (role && normalizedRole !== normalizedUserRole && normalizedRole !== user.role)
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

        // notificationPreferences is a nested sub-document — merge field by field
        // using dot-notation so a partial update (e.g. just {chatMessages:false})
        // never wipes out the sibling preference flags.
        if (req.body.notificationPreferences && typeof req.body.notificationPreferences === 'object') {
            const npAllowed = ['chatMessages', 'connectionUpdates', 'appointmentReminders'];
            npAllowed.forEach(key => {
                if (req.body.notificationPreferences[key] !== undefined) {
                    updateData[`notificationPreferences.${key}`] = req.body.notificationPreferences[key];
                }
            });
        }

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
exports.searchUser = async (req, res) => {
    try {
        const { username } = req.query;
        if (!username) return res.status(400).json({ msg: 'username is required' });
        const user = await User.findOne({ username: username.toLowerCase().trim() }).select('-password');
        if (!user) return res.status(404).json({ msg: 'No user found with this username' });
        res.json({ success: true, user });
    } catch (err) {
        return handleSaveError(err, res);
    }
};

// ── Bookmarks: toggle add/remove a law from the user's bookmarkedLaws array ──
exports.toggleBookmark = async (req, res) => {
    try {
        const { lawId } = req.params;
        if (!lawId) return res.status(400).json({ msg: 'lawId is required' });

        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ msg: 'User not found' });

        const idx = user.bookmarkedLaws.findIndex(id => id.toString() === lawId);
        let bookmarked;
        if (idx === -1) {
            user.bookmarkedLaws.push(lawId);
            bookmarked = true;
        } else {
            user.bookmarkedLaws.splice(idx, 1);
            bookmarked = false;
        }
        await user.save();
        res.json({ success: true, bookmarked, bookmarkedLaws: user.bookmarkedLaws });
    } catch (err) {
        return handleSaveError(err, res);
    }
};

// ── Bookmarks: get the user's populated bookmarked laws ──────────────────────
exports.getBookmarks = async (req, res) => {
    try {
        const ScrapedLaw = require('../models/ScrapedLaw');
        const user = await User.findById(req.user.id).select('bookmarkedLaws');
        if (!user) return res.status(404).json({ msg: 'User not found' });

        const laws = await ScrapedLaw.find({ _id: { $in: user.bookmarkedLaws } });

        // Flatten the bilingual nested fields to a flat shape, matching the
        // exact response format used by GET /api/scraped-laws/:source so the
        // frontend can render bookmarked laws with the same model either way.
        const formatted = laws.map(law => ({
            id: law._id,
            source: law.source,
            title: law.title?.en || '',
            titleUrdu: law.title?.ur || '',
            summary: law.summary?.en || '',
            summaryUrdu: law.summary?.ur || '',
            keyPoints: law.keyPoints?.en || [],
            keyPointsUrdu: law.keyPoints?.ur || [],
            link: law.link,
            isEnriched: law.isEnriched,
        }));

        res.json({ success: true, laws: formatted });
    } catch (err) {
        return handleSaveError(err, res);
    }
};

// ─────────────────────────────────────────────────────────────
// DELETE ACCOUNT
// DELETE /api/auth/delete-account
// Body: { password }
//
// Permanently deletes the logged-in user and cascades the deletion
// across every related collection (posts, chat history, engagements,
// bills, meetings, follows, notifications, etc.) via
// services/accountDeletionService.js. Previously there was NO way to
// actually delete an account anywhere in the app — the frontend's
// "delete" only ever logged the device out locally, leaving the real
// database record (and everything tied to it) untouched, which is
// why deleted accounts kept reappearing in posts, search results,
// chat history, and connection lists.
//
// Requires the current password as confirmation, the same way
// changePassword does — this is permanent and irreversible, so it
// shouldn't be triggerable by a single accidental tap with no
// re-authentication step.
// ─────────────────────────────────────────────────────────────
exports.deleteAccount = async (req, res) => {
    try {
        const { password } = req.body;
        if (!password) {
            return res.status(400).json({ msg: 'Please enter your password to confirm account deletion.' });
        }

        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ msg: 'User not found.' });

        // Google-signed-up accounts have no password set — skip the
        // password check for those, matching how changePassword
        // already handles this case elsewhere in this file.
        if (user.password) {
            const isMatch = await bcrypt.compare(password, user.password);
            if (!isMatch) {
                return res.status(401).json({ msg: 'Incorrect password.' });
            }
        }

        const { deleteUserCascade } = require('../services/accountDeletionService');
        const summary = await deleteUserCascade(req.user.id);

        console.log(`[DELETE ACCOUNT] User ${req.user.id} deleted.`, summary);
        res.json({ success: true, msg: 'Your account and all associated data have been permanently deleted.' });
    } catch (err) {
        console.error('[DELETE ACCOUNT]', err.message);
        res.status(500).json({ success: false, msg: 'Server error while deleting account.', error: err.message });
    }
};
