const mongoose = require("mongoose");

const activityLogSchema = new mongoose.Schema({
  // Who performed the action
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  userRole: {
    type: String,
    enum: ["student", "admin", "warden", "superadmin"],
    required: true,
  },
  userName: {
    type: String,
    required: true,
  },
  
  // What type of action
  action: {
    type: String,
    enum: [
      "complaint_created",
      "complaint_updated",
      "complaint_deleted",
      "complaint_resolved",
      "complaint_escalated",
      "complaint_archived",
      "complaint_restored",
      "status_changed",
      "priority_changed",
      "comment_added",
      "comment_deleted",
      "feedback_submitted",
      "notification_sent",
      "notification_read",
      "user_login",
      "user_logout",
      "user_registered",
      "settings_changed",
      "bulk_action",
    ],
    required: true,
  },
  
  // Target entity (usually a complaint)
  targetId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Complaint",
    default: null,
  },
  targetType: {
    type: String,
    enum: ["complaint", "user", "comment", "notification", "system"],
    default: "complaint",
  },
  
  // Detailed description
  description: {
    type: String,
    required: true,
  },
  
  // Before/After values for tracking changes
  changes: {
    before: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    after: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  
  // IP address and user agent for security
  ipAddress: {
    type: String,
    default: null,
  },
  userAgent: {
    type: String,
    default: null,
  },
  
  // Metadata for additional context
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  
  createdAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
});

// Indexes for efficient querying
activityLogSchema.index({ userId: 1, createdAt: -1 });
activityLogSchema.index({ targetId: 1, createdAt: -1 });
activityLogSchema.index({ action: 1, createdAt: -1 });
activityLogSchema.index({ createdAt: -1 });

// Static method to log activity
activityLogSchema.statics.logActivity = async function(activityData) {
  try {
    return await this.create(activityData);
  } catch (error) {
    console.error("Error logging activity:", error);
    return null;
  }
};

module.exports = mongoose.model("ActivityLog", activityLogSchema);
