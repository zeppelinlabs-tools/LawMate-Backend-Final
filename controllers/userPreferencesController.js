/**
 * User Notification Preferences Controller
 * GET  /api/users/notification-preferences  → get current prefs
 * PUT  /api/users/notification-preferences  → update prefs
 *
 * Supports all 3 user roles: client, lawyer, social_worker
 * Toggles: chatMessages, connectionUpdates, appointmentReminders
 */

const User = require('../models/User');

// ── GET /api/users/notification-preferences ───────────────────
exports.getPreferences = async (req, res) => {
    try {
        const user = await User.findById(req.user.id)
            .select('notificationPreferences name email role');

        if (!user) return res.status(404).json({ msg: 'User not found' });

        res.json({
            success: true,
            notificationPreferences: user.notificationPreferences
        });

    } catch (err) {
        console.error('[getPreferences]', err.message);
        res.status(500).json({ msg: 'Server error', error: err.message });
    }
};

// ── PUT /api/users/notification-preferences ───────────────────
// Body: { chatMessages?: bool, connectionUpdates?: bool, appointmentReminders?: bool }
exports.updatePreferences = async (req, res) => {
    try {
        const { chatMessages, connectionUpdates, appointmentReminders } = req.body;

        const updateData = {};
        if (chatMessages        !== undefined) updateData['notificationPreferences.chatMessages']        = chatMessages;
        if (connectionUpdates   !== undefined) updateData['notificationPreferences.connectionUpdates']   = connectionUpdates;
        if (appointmentReminders !== undefined) updateData['notificationPreferences.appointmentReminders'] = appointmentReminders;

        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({ msg: 'No preference fields provided to update' });
        }

        const updatedUser = await User.findByIdAndUpdate(
            req.user.id,
            { $set: updateData },
            { new: true }
        ).select('notificationPreferences name email role');

        if (!updatedUser) return res.status(404).json({ msg: 'User not found' });

        res.json({
            success: true,
            msg:     'Notification preferences updated.',
            notificationPreferences: updatedUser.notificationPreferences
        });

    } catch (err) {
        console.error('[updatePreferences]', err.message);
        res.status(500).json({ msg: 'Server error', error: err.message });
    }
};
