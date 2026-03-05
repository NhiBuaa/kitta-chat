const router = require("express").Router();
const messageController = require("../controllers/messageController");
const upload = require("../middlewares/upload");
const authMiddleware = require("../middlewares/auth");

router.post("/", messageController.createMessage);
router.get("/:userId1/:userId2", messageController.getMessages);
router.post(
  "/upload",
  authMiddleware,
  upload.single("image"),
  messageController.uploadImage,
);

router.post(
  "/upload-multiple",
  authMiddleware,
  upload.array("files", 10), // tối đa 10 file
  messageController.uploadMultipleFiles,
);

module.exports = router;
