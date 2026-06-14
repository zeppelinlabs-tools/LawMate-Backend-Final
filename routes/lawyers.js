const express          = require('express');
const router           = express.Router();
const lawyerController = require('../controllers/lawyerController');
const auth             = require('../middleware/authMiddleware');
const { blockUnverifiedProfessional } = require('../middleware/verifiedOnly');

// Public — only verified professionals shown
router.get('/',               lawyerController.getLawyers);
router.get('/social-workers', lawyerController.getSocialWorkers);
router.get('/:id',            lawyerController.getLawyerById);

module.exports = router;
