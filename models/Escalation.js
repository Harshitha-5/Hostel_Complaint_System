const mongoose = require("mongoose");

const escalationSchema = new mongoose.Schema({
  complaintId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Complaint",
    required: true,
    index: true,
  },
  
  // Escalation details
  reason: {
    type: String,
    required: true,
    enum: [
      "overdue",           // Past expected completion date
      "no_response",       // No admin response for X days
      "student_request",   // Student manually requested escalation
      "high_priority",     // High priority complaint not addressed
      "repeated_issue",    // Same issue reported multiple times
      "admin_action",      // Admin escalated for higher authority
    ],
  },
  
  description: {
    type: String,
    maxlength: 1000,
  },
  
  // Who escalated
  escalatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  escalatedByRole: {
    type: String,
    enum: ["student", "admin", "warden", "system"],
    required: true,
  },
  
  // Escalation level
  level: {
    type: Number,
    default: 1, // Level 1: Warden, Level 2: Super Admin, Level 3: Management
    min: 1,
    max: 3,
  },
  
  // Current status
  status: {
    type: String,
    enum: ["pending", "acknowledged", "resolved", "dismissed"],
    default: "pending",
  },
  
  // Assigned to (for resolution)
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null,
  },
  
  // Resolution details
  resolvedAt: {
    type: Date,
    default: null,
  },
  resolvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null,
  },
  resolutionNotes: {
    type: String,
    default: "",
  },
  
  // Notifications sent
  notificationsSent: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    sentAt: {
      type: Date,
      default: Date.now,
    },
    channel: {
      type: String,
      enum: ["email", "push", "in_app"],
    },
  }],
  
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Indexes
escalationSchema.index({ complaintId: 1, status: 1 });
escalationSchema.index({ status: 1, level: 1, createdAt: -1 });
escalationSchema.index({ escalatedBy: 1, createdAt: -1 });

// Update timestamp
escalationSchema.pre("save", function () {
  this.updatedAt = new Date();
});

module.exports = mongoose.model("Escalation", escalationSchema);
