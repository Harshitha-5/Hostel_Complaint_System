const express = require("express");
const router = express.Router();
const { auth, adminOnly } = require("../middleware/authMiddleware");
const { getStatistics } = require("../controllers/analyticsController");

// Get statistics (admin only)
router.get("/statistics", auth, adminOnly, getStatistics);

// Get public statistics (for landing page)
const { getPublicStatistics } = require("../controllers/analyticsController");
router.get("/public-stats", getPublicStatistics);

module.exports = router;
