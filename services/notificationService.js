const Notification = require("../models/Notification");
const ActivityLog = require("../models/ActivityLog");

class NotificationService {
  constructor(io) {
    this.io = io;
  }

  // Create and send notification
  async createNotification({
    userId,
    type,
    title,
    message,
    complaintId = null,
    senderId = null,
    senderRole = null,
    priority = "normal",
    actionUrl = null,
    metadata = {},
  }) {
    try {
      // Create notification in database
      const notification = await Notification.create({
        userId,
        type,
        title,
        message,
        complaintId,
        senderId,
        senderRole,
        priority,
        actionUrl,
        metadata,
      });

      // Emit real-time notification via Socket.io
      this.emitNotification(userId, notification);

      // Log the notification
      await ActivityLog.logActivity({
        userId: senderId || userId,
        userRole: senderRole || "system",
        userName: metadata.senderName || "System",
        action: "notification_sent",
        targetId: complaintId,
        targetType: complaintId ? "complaint" : "user",
        description: `Notification sent to user ${userId}: ${title}`,
        metadata: { notificationId: notification._id, type },
      });

      return notification;
    } catch (error) {
      console.error("Error creating notification:", error);
      return null;
    }
  }

  // Emit notification to specific user
  emitNotification(userId, notification) {
    if (this.io) {
      this.io.to(`user:${userId}`).emit("notification", notification);
    }
  }

  // Send bulk notifications
  async sendBulkNotifications(userIds, notificationData) {
    const notifications = [];
    for (const userId of userIds) {
      const notification = await this.createNotification({
        ...notificationData,
        userId,
      });
      if (notification) notifications.push(notification);
    }
    return notifications;
  }

  // Notify admins of new complaint
  async notifyAdminsNewComplaint(complaint, student) {
    const message = `New ${complaint.priority} priority complaint: "${complaint.title}" from ${student.name}`;
    
    // Emit to admin room
    if (this.io) {
      this.io.to("admin").emit("complaintCreated", {
        complaintId: complaint._id,
        title: complaint.title,
        priority: complaint.priority,
        category: complaint.category,
        studentName: student.name,
        studentId: student._id,
        createdAt: complaint.createdAt,
      });
    }

    // Create in-app notifications for all admins
    // This would typically query for admin users
    return message;
  }

  // Notify complaint status change
  async notifyStatusChange(complaint, oldStatus, newStatus, updater) {
    const statusLabels = {
      pending: "Pending",
      in_progress: "In Progress",
      resolved: "Resolved",
      on_hold: "On Hold",
      escalated: "Escalated",
    };

    const message = `Your complaint "${complaint.title}" has been updated to "${statusLabels[newStatus]}"`;

    await this.createNotification({
      userId: complaint.studentId,
      type: "status_change",
      title: "Complaint Status Updated",
      message,
      complaintId: complaint._id,
      senderId: updater._id,
      senderRole: updater.role,
      priority: newStatus === "escalated" ? "high" : "normal",
      actionUrl: `/student?complaint=${complaint._id}`,
      metadata: {
        oldStatus,
        newStatus,
        senderName: updater.name,
      },
    });
  }

  // Notify new comment
  async notifyNewComment(complaint, comment, author) {
    // Notify complaint owner if not the author
    if (complaint.studentId.toString() !== comment.authorId.toString()) {
      await this.createNotification({
        userId: complaint.studentId,
        type: "comment",
        title: "New Comment on Your Complaint",
        message: `${author.name} commented on "${complaint.title}"`,
        complaintId: complaint._id,
        senderId: author._id,
        senderRole: author.role,
        actionUrl: `/student?complaint=${complaint._id}`,
        metadata: {
          senderName: author.name,
          commentPreview: comment.content.substring(0, 100),
        },
      });
    }

    // Notify mentioned users
    if (comment.mentions && comment.mentions.length > 0) {
      for (const mentionedUserId of comment.mentions) {
        if (mentionedUserId.toString() !== comment.authorId.toString()) {
          await this.createNotification({
            userId: mentionedUserId,
            type: "mention",
            title: "You were mentioned in a comment",
            message: `${author.name} mentioned you in a comment on "${complaint.title}"`,
            complaintId: complaint._id,
            senderId: author._id,
            senderRole: author.role,
            priority: "high",
            actionUrl: `/student?complaint=${complaint._id}`,
            metadata: {
              senderName: author.name,
            },
          });
        }
      }
    }
  }

  // Notify escalation
  async notifyEscalation(escalation, complaint, escalator) {
    const message = `Complaint "${complaint.title}" has been escalated to Level ${escalation.level}`;

    // Notify student
    await this.createNotification({
      userId: complaint.studentId,
      type: "escalation",
      title: "Complaint Escalated",
      message: `Your complaint has been escalated. Reason: ${escalation.reason}`,
      complaintId: complaint._id,
      senderId: escalator._id,
      senderRole: escalator.role,
      priority: "high",
      actionUrl: `/student?complaint=${complaint._id}`,
      metadata: {
        escalationLevel: escalation.level,
        reason: escalation.reason,
        senderName: escalator.name,
      },
    });

    // Notify higher-level admins
    if (this.io) {
      this.io.to("admin").emit("escalationCreated", {
        escalationId: escalation._id,
        complaintId: complaint._id,
        title: complaint.title,
        level: escalation.level,
        reason: escalation.reason,
        escalatedBy: escalator.name,
      });
    }
  }

  // Send reminder for pending complaints
  async sendPendingReminder(complaint, daysPending) {
    await this.createNotification({
      userId: complaint.studentId,
      type: "reminder",
      title: "Complaint Pending Reminder",
      message: `Your complaint "${complaint.title}" has been pending for ${daysPending} days`,
      complaintId: complaint._id,
      priority: daysPending > 5 ? "high" : "normal",
      actionUrl: `/student?complaint=${complaint._id}`,
      metadata: {
        daysPending,
      },
    });
  }

  // Mark notification as read
  async markAsRead(notificationId, userId) {
    try {
      const notification = await Notification.findOneAndUpdate(
        { _id: notificationId, userId },
        { isRead: true, readAt: new Date() },
        { new: true }
      );

      if (notification) {
        await ActivityLog.logActivity({
          userId,
          userRole: "student", // Will be determined from context
          userName: "User",
          action: "notification_read",
          targetId: notificationId,
          targetType: "notification",
          description: `Notification ${notificationId} marked as read`,
        });
      }

      return notification;
    } catch (error) {
      console.error("Error marking notification as read:", error);
      return null;
    }
  }

  // Get unread count for user
  async getUnreadCount(userId) {
    return await Notification.countDocuments({ userId, isRead: false });
  }

  // Get notifications for user
  async getUserNotifications(userId, options = {}) {
    const { limit = 20, skip = 0, unreadOnly = false } = options;
    
    const query = { userId };
    if (unreadOnly) query.isRead = false;

    return await Notification.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("complaintId", "title status")
      .populate("senderId", "name role");
  }
}

module.exports = NotificationService;
