const router = require('express').Router();
const groupController = require('../controllers/groupController');
const authMiddleware = require('../middlewares/auth');

router.post('/', authMiddleware, groupController.createGroup);
router.get('/', authMiddleware, groupController.getMyGroups);
router.post('/:groupId/add-member', authMiddleware, groupController.addMember);
router.post('/:groupId/remove-member', authMiddleware, groupController.removeMember);
router.post('/:groupId/transfer-admin', authMiddleware, groupController.transferAdmin);
router.put('/:groupId/rename', authMiddleware, groupController.renameGroup);

module.exports = router;