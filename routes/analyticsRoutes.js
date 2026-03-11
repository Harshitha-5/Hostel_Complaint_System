const express = require("express");
const router = express.Router();
const { protect, restrictTo } = require("../middleware/authMiddleware");
const {
  getStatistics,
  getPublicStatistics,
  getDashboardAnalytics,
  getRecurringIssues,
  getStaffPerformance,
  getPredictiveInsights,
  getPeakHours,
  getSatisfactionMetrics,
} = require("../controllers/analyticsController");

// Public routes
router.get("/public-stats", getPublicStatistics);

// Protected routes
router.use(protect);

// Get statistics (admin only)
router.get("/statistics", restrictTo("admin", "warden", "superadmin"), getStatistics);

// Get comprehensive dashboard analytics
router.get("/dashboard", restrictTo("admin", "warden", "superadmin"), getDashboardAnalytics);

// Get recurring issues
router.get("/recurring-issues", restrictTo("admin", "warden", "superadmin"), getRecurringIssues);

// Get staff performance
router.get("/staff-performance", restrictTo("admin", "warden", "superadmin"), getStaffPerformance);

// Get predictive insights
router.get("/predictive-insights", restrictTo("admin", "warden", "superadmin"), getPredictiveInsights);

// Get peak hours data
router.get("/peak-hours", restrictTo("admin", "warden", "superadmin"), getPeakHours);

// Get satisfaction metrics
router.get("/satisfaction", restrictTo("admin", "warden", "superadmin"), getSatisfactionMetrics);

module.exports = router;
