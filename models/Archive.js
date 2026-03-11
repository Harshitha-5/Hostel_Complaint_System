const mongoose = require("mongoose");

const archiveSchema = new mongoose.Schema({
  // Original complaint data (snapshot)
  originalComplaintId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true,
  },
  
  // Complete snapshot of the complaint
  complaintData: {
    type: mongoose.Schema.Types.Mixed,
    required: true,
  },
  
  // Related data snapshots
  comments: [{
    type: mongoose.Schema.Types.Mixed,
  }],
  
  activityLogs: [{
    type: mongoose.Schema.Types.Mixed,
  }],
  
  // Archive metadata
  archivedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  archivedByRole: {
    type: String,
    enum: ["admin", "warden", "superadmin", "system"],
    required: true,
  },
  
  archiveReason: {
    type: String,
    enum: [
      "resolved",
      "auto_archive",      // Automatically archived after X days
      "duplicate",
      "spam",
      "withdrawn",
      "manual",
    ],
    default: "resolved",
  },
  
  // For auto-archive tracking
  autoArchived: {
    type: Boolean,
    default: false,
  },
  
  // Retention period (when to permanently delete)
  retentionUntil: {
    type: Date,
    default: null,
  },
  
  // If restored
  restoredAt: {
    type: Date,
    default: null,
  },
  restoredBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null,
  },
  restoreReason: {
    type: String,
    default: "",
  },
  
  // Search tags for archived records
  tags: [{
    type: String,
  }],
  
  // Performance metrics at time of archive
  metrics: {
    resolutionTimeDays: Number,
    totalComments: Number,
    escalationsCount: Number,
    finalRating: Number,
  },
  
  createdAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
});

// Indexes for searching archived records
archiveSchema.index({ "complaintData.studentId": 1, createdAt: -1 });
archiveSchema.index({ "complaintData.category": 1, createdAt: -1 });
archiveSchema.index({ "complaintData.status": 1, createdAt: -1 });
archiveSchema.index({ tags: 1 });
archiveSchema.index({ archiveReason: 1, createdAt: -1 });

// Text search on complaint data
archiveSchema.index({ 
  "complaintData.title": "text", 
  "complaintData.description": "text" 
});

module.exports = mongoose.model("Archive", archiveSchema);
