const express = require("express");
const router = express.Router();
const commentController = require("../controllers/commentController");
const { protect, restrictTo } = require("../middleware/authMiddleware");

// All routes require authentication
router.use(protect);

// Get comments for a complaint
router.get("/complaint/:complaintId", commentController.getComments);

// Add a comment
router.post("/complaint/:complaintId", commentController.addComment);

// Update a comment
router.put("/:commentId", commentController.updateComment);

// Delete a comment
router.delete("/:commentId", commentController.deleteComment);

// Get comment thread (with replies)
router.get("/thread/:commentId", commentController.getCommentThread);

// Mark mentions as read
router.post("/mentions/:complaintId/read", commentController.markMentionsRead);

module.exports = router;
