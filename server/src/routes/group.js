const router = require('express').Router();
const groupController = require('../controllers/groupController');
const authMiddleware = require('../middlewares/auth');

router.post('/', authMiddleware, groupController.createGroup);
router.get('/', authMiddleware, groupController.getMyGroups);

module.exports = router;