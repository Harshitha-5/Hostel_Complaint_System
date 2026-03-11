const Comment = require("../models/Comment");
const Complaint = require("../models/Complaint");
const ActivityLog = require("../models/ActivityLog");
const NotificationService = require("../services/notificationService");

// Get comments for a complaint
exports.getComments = async (req, res) => {
  try {
    const { complaintId } = req.params;
    const { page = 1, limit = 20 } = req.query;

    // Verify complaint exists and user has access
    const complaint = await Complaint.findById(complaintId);
    if (!complaint) {
      return res.status(404).json({ success: false, message: "Complaint not found" });
    }

    // Check access rights
    const isAuthorized = 
      req.user.role === "admin" || 
      req.user.role === "warden" || 
      req.user.role === "superadmin" ||
      complaint.studentId.toString() === req.user._id.toString();

    if (!isAuthorized) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    // Build query
    const query = { complaintId, deletedAt: null };
    
    // Students can't see internal comments
    if (req.user.role === "student") {
      query.isInternal = false;
    }

    const comments = await Comment.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .populate("authorId", "name role avatar")
      .populate("mentions", "name");

    const total = await Comment.countDocuments(query);

    res.json({
      success: true,
      comments,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching comments:", error);
    res.status(500).json({ success: false, message: "Error fetching comments" });
  }
};

// Add a comment
exports.addComment = async (req, res) => {
  try {
    const { complaintId } = req.params;
    const { content, parentCommentId = null, isInternal = false, mentions = [] } = req.body;

    if (!content || content.trim().length === 0) {
      return res.status(400).json({ success: false, message: "Comment content is required" });
    }

    // Verify complaint exists
    const complaint = await Complaint.findById(complaintId).populate("studentId", "name");
    if (!complaint) {
      return res.status(404).json({ success: false, message: "Complaint not found" });
    }

    // Check access rights
    const isAuthorized = 
      req.user.role === "admin" || 
      req.user.role === "warden" || 
      req.user.role === "superadmin" ||
      complaint.studentId._id.toString() === req.user._id.toString();

    if (!isAuthorized) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    // Only admins can add internal comments
    if (isInternal && !["admin", "warden", "superadmin"].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: "Only staff can add internal comments" });
    }

    // Create comment
    const comment = await Comment.create({
      complaintId,
      authorId: req.user._id,
      authorRole: req.user.role,
      authorName: req.user.name,
      content: content.trim(),
      parentCommentId,
      isInternal,
      mentions,
    });

    // Update complaint's last activity
    complaint.lastActivityAt = new Date();
    await complaint.save();

    // Log activity
    await ActivityLog.logActivity({
      userId: req.user._id,
      userRole: req.user.role,
      userName: req.user.name,
      action: "comment_added",
      targetId: complaintId,
      targetType: "complaint",
      description: `Comment added to complaint "${complaint.title}"`,
      metadata: { commentId: comment._id, isInternal },
    });

    // Send notifications
    const io = req.app.io;
    if (io) {
      const notificationService = new NotificationService(io);
      await notificationService.notifyNewComment(complaint, comment, req.user);

      // Emit real-time comment to connected users
      io.to(`complaint:${complaintId}`).emit("newComment", {
        comment: await Comment.findById(comment._id)
          .populate("authorId", "name role avatar"),
        complaintId,
      });
    }

    res.status(201).json({
      success: true,
      comment: await Comment.findById(comment._id)
        .populate("authorId", "name role avatar"),
      message: "Comment added successfully",
    });
  } catch (error) {
    console.error("Error adding comment:", error);
    res.status(500).json({ success: false, message: "Error adding comment" });
  }
};

// Update a comment
exports.updateComment = async (req, res) => {
  try {
    const { commentId } = req.params;
    const { content } = req.body;

    const comment = await Comment.findById(commentId);
    if (!comment) {
      return res.status(404).json({ success: false, message: "Comment not found" });
    }

    // Only author or admin can update
    if (comment.authorId.toString() !== req.user._id.toString() && 
        !["admin", "superadmin"].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    comment.content = content.trim();
    comment.updatedAt = new Date();
    await comment.save();

    res.json({
      success: true,
      comment: await Comment.findById(commentId)
        .populate("authorId", "name role avatar"),
      message: "Comment updated successfully",
    });
  } catch (error) {
    console.error("Error updating comment:", error);
    res.status(500).json({ success: false, message: "Error updating comment" });
  }
};

// Delete a comment (soft delete)
exports.deleteComment = async (req, res) => {
  try {
    const { commentId } = req.params;

    const comment = await Comment.findById(commentId);
    if (!comment) {
      return res.status(404).json({ success: false, message: "Comment not found" });
    }

    // Only author or admin can delete
    if (comment.authorId.toString() !== req.user._id.toString() && 
        !["admin", "superadmin"].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    comment.deletedAt = new Date();
    await comment.save();

    // Log activity
    await ActivityLog.logActivity({
      userId: req.user._id,
      userRole: req.user.role,
      userName: req.user.name,
      action: "comment_deleted",
      targetId: comment.complaintId,
      targetType: "complaint",
      description: "Comment deleted",
      metadata: { commentId },
    });

    res.json({ success: true, message: "Comment deleted successfully" });
  } catch (error) {
    console.error("Error deleting comment:", error);
    res.status(500).json({ success: false, message: "Error deleting comment" });
  }
};

// Get comment thread (with replies)
exports.getCommentThread = async (req, res) => {
  try {
    const { commentId } = req.params;

    const parentComment = await Comment.findById(commentId);
    if (!parentComment) {
      return res.status(404).json({ success: false, message: "Comment not found" });
    }

    // Get all replies
    const replies = await Comment.find({
      parentCommentId: commentId,
      deletedAt: null,
    })
      .sort({ createdAt: 1 })
      .populate("authorId", "name role avatar");

    res.json({
      success: true,
      parentComment: await Comment.findById(commentId)
        .populate("authorId", "name role avatar"),
      replies,
    });
  } catch (error) {
    console.error("Error fetching comment thread:", error);
    res.status(500).json({ success: false, message: "Error fetching comment thread" });
  }
};

// Mark mentions as read
exports.markMentionsRead = async (req, res) => {
  try {
    const { complaintId } = req.params;

    // This would typically update a read status for mentions
    // For now, we'll just acknowledge
    res.json({ success: true, message: "Mentions marked as read" });
  } catch (error) {
    console.error("Error marking mentions as read:", error);
    res.status(500).json({ success: false, message: "Error marking mentions as read" });
  }
};
