const mongoose = require("mongoose");

const complaintSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    required: true,
  },
  category: {
    type: String,
    enum: ["cleaning", "maintenance", "food", "water", "electricity", "electrical", "plumbing", "furniture", "internet", "security", "other", "others"],
    default: "other",
  },
  subCategory: {
    type: String,
    default: "",
  },
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  status: {
    type: String,
    enum: ["pending", "in_progress", "resolved", "on_hold", "escalated"],
    default: "pending",
  },
  priority: {
    type: String,
    enum: ["low", "medium", "high", "critical"],
    default: "medium",
  },
  images: [{ type: String }],
  videos: [{ type: String }], // Support for video attachments
  documents: [{ type: String }], // Support for document attachments
  adminNotes: { type: String, default: "" },

  // Cost estimation & budget tracking
  estimatedCost: { type: Number, default: null },
  actualCost: { type: Number, default: null },
  currency: { type: String, default: "INR" },

  // Multi-level approval workflow
  approvalStatus: {
    type: String,
    enum: ["pending_approval", "approved", "rejected"],
    default: "approved",
  },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  approvedAt: { type: Date, default: null },
  rejectionReason: { type: String, default: "" },

  // Version tracking
  version: { type: Number, default: 1 },

  // Soft delete
  deletedAt: { type: Date, default: null },
  deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

  // Time estimation
  estimatedDays: {
    type: Number,
    default: null,
    min: 0,
  },
  expectedCompletionDate: {
    type: Date,
    default: null,
  },

  // Student feedback on resolution
  resolutionRating: {
    type: Number,
    min: 1,
    max: 5,
    default: null,
  },
  resolutionFeedback: {
    type: String,
    default: "",
    maxlength: 1000,
  },
  
  // Assignment and ownership
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null,
  },
  assignedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null,
  },
  assignedAt: {
    type: Date,
    default: null,
  },
  
  // Location details
  block: {
    type: String,
    default: "",
  },
  floor: {
    type: String,
    default: "",
  },
  roomNumber: {
    type: String,
    default: "",
  },
  
  // Tags for better categorization
  tags: [{
    type: String,
  }],
  
  // AI/Auto suggestions
  suggestedSolution: {
    type: String,
    default: "",
  },
  aiConfidence: {
    type: Number,
    min: 0,
    max: 100,
    default: null,
  },
  
  // Duplicate detection
  isDuplicate: {
    type: Boolean,
    default: false,
  },
  duplicateOf: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Complaint",
    default: null,
  },
  
  // View count (for trending issues)
  viewCount: {
    type: Number,
    default: 0,
  },
  
  // Last activity timestamp
  lastActivityAt: {
    type: Date,
    default: Date.now,
  },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  resolvedAt: { type: Date, default: null },
});

// Ensure updatedAt is always refreshed on save
complaintSchema.pre("save", function () {
  this.updatedAt = new Date();
});

// Indexes for efficient querying
complaintSchema.index({ studentId: 1, createdAt: -1 });
complaintSchema.index({ status: 1, priority: 1 });
complaintSchema.index({ category: 1, createdAt: -1 });
complaintSchema.index({ assignedTo: 1, status: 1 });
complaintSchema.index({ createdAt: -1 });
complaintSchema.index({ lastActivityAt: -1 });

// Text search index
complaintSchema.index({ title: "text", description: "text", tags: "text" });

// Static method to find similar complaints (for duplicate detection)
complaintSchema.statics.findSimilar = async function(title, description, category, studentId, daysBack = 7) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysBack);
  
  return await this.find({
    studentId: studentId,
    category: category,
    createdAt: { $gte: cutoffDate },
    deletedAt: null,
    $or: [
      { title: { $regex: title.split(' ').slice(0, 3).join('|'), $options: 'i' } },
      { description: { $regex: description.split(' ').slice(0, 5).join('|'), $options: 'i' } }
    ]
  }).limit(5);
};

module.exports = mongoose.model("Complaint", complaintSchema);
