const router = require('express').Router();
const messageController = require('../controllers/messageController');

router.post('/', messageController.createMessage);
router.get('/:userId1/:userId2', messageController.getMessages);

module.exports = router;