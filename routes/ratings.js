const express = require('express');
const router  = express.Router();
const auth    = require('../middleware/authMiddleware');
const ctrl    = require('../controllers/ratingController');

router.get ('/pending',                    auth, ctrl.getPendingRatings);
router.get ('/professional/:professionalId', ctrl.getProfessionalRatings);
router.post('/',                           auth, ctrl.submitRating);

module.exports = router;
