/**
 * User Notification Preferences Routes
 * Both require JWT authentication.
 *
 * GET /api/users/notification-preferences → get current preferences
 * PUT /api/users/notification-preferences → update preferences
 */

const express = require('express');
const router  = express.Router();
const auth    = require('../middleware/authMiddleware');
const ctrl    = require('../controllers/userPreferencesController');

router.get('/', auth, ctrl.getPreferences);
router.put('/', auth, ctrl.updatePreferences);

module.exports = router;
