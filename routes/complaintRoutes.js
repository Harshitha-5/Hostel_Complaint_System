const express = require("express");
const router = express.Router();
const { auth, adminOnly } = require("../middleware/authMiddleware");
const upload = require("../config/multer");
const {
  createComplaint,
  getComplaints,
  getComplaintById,
  updateComplaintStatus,
  deleteComplaint,
} = require("../controllers/ComplaintController.js");

// Create complaint with file upload (authenticated users)
router.post("/", auth, upload.array("images", 5), createComplaint);

// Get complaints (filtered by user role)
router.get("/", auth, getComplaints);

// Get single complaint
router.get("/:id", auth, getComplaintById);

// Update complaint status (admin only)
router.put("/:id/update-status", auth, adminOnly, updateComplaintStatus);

// Delete complaint
router.delete("/:id", auth, deleteComplaint);

module.exports = router;

