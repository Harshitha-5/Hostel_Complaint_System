const express = require("express");
const router = express.Router();
const escalationController = require("../controllers/escalationController");
const { protect, restrictTo } = require("../middleware/authMiddleware");

// All routes require authentication
router.use(protect);

// Student routes
router.get("/my-escalations", restrictTo("student"), escalationController.getStudentEscalations);
router.post("/complaint/:complaintId", restrictTo("student"), escalationController.createEscalation);

// Admin routes
router.get("/", restrictTo("admin", "warden", "superadmin"), escalationController.getEscalations);
router.get("/stats", restrictTo("admin", "warden", "superadmin"), escalationController.getEscalationStats);
router.post("/trigger-auto", restrictTo("admin", "superadmin"), escalationController.triggerAutoEscalation);
router.put("/:escalationId/acknowledge", restrictTo("admin", "warden", "superadmin"), escalationController.acknowledgeEscalation);
router.put("/:escalationId/resolve", restrictTo("admin", "warden", "superadmin"), escalationController.resolveEscalation);

module.exports = router;
