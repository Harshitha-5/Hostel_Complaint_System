const express = require("express");
const router = express.Router();
const { auth } = require("../middleware/authMiddleware");
const {
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
} = require("../controllers/notificationController");

// Get all notifications for user
router.get("/", auth, getNotifications);

// Mark single notification as read
router.put("/:notificationId/read", auth, markAsRead);

// Mark all notifications as read
router.put("/read-all", auth, markAllAsRead);

// Delete notification
router.delete("/:notificationId", auth, deleteNotification);

module.exports = router;
