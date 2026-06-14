const express = require('express');
const router  = express.Router();
const auth    = require('../middleware/authMiddleware');
const ctrl    = require('../controllers/appointmentController');

router.get ('/',           auth, ctrl.getAppointments);
router.post('/',           auth, ctrl.createAppointment);
router.put ('/:id/status', auth, ctrl.updateStatus);

module.exports = router;
