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
    enum: ["cleaning", "maintenance", "food", "water", "electricity", "electrical", "plumbing", "furniture", "internet", "other", "others"],
    default: "other",
  },
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  status: {
    type: String,
    enum: ["pending", "in_progress", "resolved"],
    default: "pending",
  },
  priority: {
    type: String,
    enum: ["low", "medium", "high"],
    default: "medium",
  },
  images: [{ type: String }],
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

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  resolvedAt: { type: Date, default: null },
});

// Ensure updatedAt is always refreshed on save
complaintSchema.pre("save", function () {
  this.updatedAt = new Date();
});

module.exports = mongoose.model("Complaint", complaintSchema);
