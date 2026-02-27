const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  complaintId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Complaint",
  },
  message: {
    type: String,
    required: true,
  },
  type: {
    type: String,
    enum: ["status_update", "new_admin_note", "complaint_resolved", "high_priority_alert"],
    default: "status_update",
  },
  priority: { type: String, default: "normal" },
  read: {
    type: Boolean,
    default: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("Notification", notificationSchema);
