const express = require("express");
const router = express.Router();
const archiveController = require("../controllers/archiveController");
const { protect, restrictTo } = require("../middleware/authMiddleware");

// All routes require authentication
router.use(protect);

// Student routes
router.get("/my-archives", restrictTo("student"), archiveController.getStudentArchives);

// Admin routes
router.get("/search", restrictTo("admin", "warden", "superadmin"), archiveController.searchArchives);
router.get("/stats", restrictTo("admin", "warden", "superadmin"), archiveController.getArchiveStats);
router.post("/auto-archive", restrictTo("admin", "superadmin"), archiveController.triggerAutoArchive);
router.post("/complaint/:complaintId", restrictTo("admin", "warden", "superadmin"), archiveController.archiveComplaint);
router.post("/restore/:archiveId", restrictTo("admin", "superadmin"), archiveController.restoreComplaint);
router.get("/:archiveId", archiveController.getArchivedComplaint);

module.exports = router;
