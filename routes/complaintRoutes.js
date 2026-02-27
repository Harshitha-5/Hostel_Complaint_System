const express = require("express");
const router = express.Router();
const { auth, adminOnly } = require("../middleware/authMiddleware");
const upload = require("../config/multer");
const {
  createComplaint,
  getComplaints,
  getComplaintById,
  getVersionHistory,
  checkDuplicate,
  updateComplaintStatus,
  updateComplaintCost,
  approveComplaint,
  deleteComplaint,
  restoreComplaint,
} = require("../controllers/complaintController");

router.post("/", auth, upload.array("images", 5), createComplaint);
router.get("/", auth, getComplaints);
router.get("/check-duplicate", auth, checkDuplicate);
router.get("/:id", auth, getComplaintById);
router.get("/:id/versions", auth, getVersionHistory);
router.put("/:id/update-status", auth, adminOnly, updateComplaintStatus);
router.put("/:id/cost", auth, adminOnly, updateComplaintCost);
router.put("/:id/approve", auth, adminOnly, approveComplaint);
router.delete("/:id", auth, deleteComplaint);
router.post("/:id/restore", auth, adminOnly, restoreComplaint);

module.exports = router;
