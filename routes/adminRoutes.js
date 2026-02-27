const express = require("express");
const router = express.Router();
const { auth, verifyAdmin } = require("../middleware/authMiddleware");
const { getAdminStats } = require("../controllers/analyticsController");
const {
  getComplaints,
  getComplaintById,
  updateComplaintStatus,
  updateComplaintCost,
  approveComplaint,
  deleteComplaint,
  restoreComplaint,
  getAnalytics,
} = require("../controllers/complaintController");

// All admin routes require authentication and admin role
router.use(auth, verifyAdmin);

// Admin endpoints
router.get("/stats", getAdminStats);
router.get("/complaints", getComplaints);
router.get("/complaints/:id", getComplaintById);
router.put("/complaints/:id/status", updateComplaintStatus);
router.put("/complaints/:id/cost", updateComplaintCost);
router.put("/complaints/:id/approve", approveComplaint);
router.delete("/complaints/:id", deleteComplaint);
router.post("/complaints/:id/restore", restoreComplaint);
router.get("/analytics", getAnalytics);

module.exports = router;
