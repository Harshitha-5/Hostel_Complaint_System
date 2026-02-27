const express = require("express");
const router = express.Router();
const { auth, verifyStudent } = require("../middleware/authMiddleware");
const upload = require("../config/multer");
const {
  createComplaint,
  getMyComplaints,
  getComplaintById,
  updateComplaint,
  checkDuplicate,
  deleteComplaint,
  submitResolutionFeedback,
} = require("../controllers/complaintController");

// All student routes require authentication and student role
router.use(auth, verifyStudent);

// Student endpoints
router.post("/complaints", upload.array("images", 5), createComplaint);
router.get("/complaints", getMyComplaints);
router.get("/complaints/check-duplicate", checkDuplicate);
router.get("/complaints/:id", getComplaintById);
router.put("/complaints/:id", updateComplaint);
router.delete("/complaints/:id", deleteComplaint);
router.post("/complaints/:id/feedback", submitResolutionFeedback);

module.exports = router;
