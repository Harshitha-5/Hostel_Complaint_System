const express = require("express");
const router = express.Router();
const aiController = require("../controllers/aiController");
const { protect, restrictTo } = require("../middleware/authMiddleware");

// All routes require authentication
router.use(protect);

// Analyze complaint (available to all authenticated users)
router.post("/analyze", aiController.analyzeComplaint);

// Get suggestions for existing complaint
router.get("/suggestions/:complaintId", aiController.getComplaintSuggestions);

// Check for duplicate complaints
router.post("/check-duplicates", aiController.checkDuplicates);

// Suggest category based on description
router.post("/suggest-category", aiController.suggestCategory);

// Get trending issues (admin only)
router.get("/trending", restrictTo("admin", "warden", "superadmin"), aiController.getTrendingIssues);

// Predict resolution time
router.get("/predict-resolution", aiController.predictResolutionTime);

// Auto-assign complaint (admin only)
router.post("/auto-assign/:complaintId", restrictTo("admin", "warden", "superadmin"), aiController.autoAssignComplaint);

module.exports = router;
