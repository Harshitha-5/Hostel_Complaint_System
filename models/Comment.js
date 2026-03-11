const mongoose = require("mongoose");

const commentSchema = new mongoose.Schema({
  complaintId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Complaint",
    required: true,
    index: true,
  },
  authorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  authorRole: {
    type: String,
    enum: ["student", "admin", "warden", "superadmin"],
    required: true,
  },
  authorName: {
    type: String,
    required: true,
  },
  content: {
    type: String,
    required: true,
    maxlength: 2000,
  },
  // For threaded conversations
  parentCommentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Comment",
    default: null,
  },
  // Mentions (@username)
  mentions: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  }],
  // Attachments in comments
  attachments: [{
    type: String, // URL to attachment
  }],
  // For internal/admin notes
  isInternal: {
    type: Boolean,
    default: false,
  },
  // Soft delete
  deletedAt: {
    type: Date,
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Index for faster queries
commentSchema.index({ complaintId: 1, createdAt: -1 });
commentSchema.index({ authorId: 1, createdAt: -1 });

// Update timestamp on save
commentSchema.pre("save", function () {
  this.updatedAt = new Date();
});

module.exports = mongoose.model("Comment", commentSchema);
