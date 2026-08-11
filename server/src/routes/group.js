const router = require('express').Router();
const groupController = require('../controllers/groupController');
const authMiddleware = require('../middlewares/auth');
const { createHttpRateLimitMiddleware } = require('../rateLimit/httpAdmissionMiddleware');

const groupMutationLimiter = createHttpRateLimitMiddleware({
  policyIds: ["state_mutation.aggregate", "state_mutation.group_admin"],
});
const groupReadLimiter = createHttpRateLimitMiddleware({
  policyIds: ["read_expensive.aggregate", "read_expensive.groups"],
});

router.post('/', authMiddleware, groupMutationLimiter, groupController.createGroup);
router.get('/', authMiddleware, groupReadLimiter, groupController.getMyGroups);
router.post('/:groupId/add-member', authMiddleware, groupMutationLimiter, groupController.addMember);
router.post('/:groupId/remove-member', authMiddleware, groupMutationLimiter, groupController.removeMember);
router.post('/:groupId/transfer-admin', authMiddleware, groupMutationLimiter, groupController.transferAdmin);
router.put('/:groupId/rename', authMiddleware, groupMutationLimiter, groupController.renameGroup);
router.delete('/:groupId', authMiddleware, groupMutationLimiter, groupController.deleteGroup);
router.get("/:groupId", authMiddleware, groupReadLimiter, groupController.getGroupById);

module.exports = router;
