const Complaint = require("../models/Complaint");
const Notification = require("../models/Notification");

class ReminderService {
  constructor(notificationService) {
    this.notificationService = notificationService;
  }

  // Send reminders for pending complaints
  async sendPendingReminders() {
    const reminders = [];

    // Get complaints pending for different durations
    const pending3Days = await this.getPendingComplaints(3);
    const pending7Days = await this.getPendingComplaints(7);
    const pending14Days = await this.getPendingComplaints(14);

    // Send reminders
    for (const complaint of pending3Days) {
      const reminder = await this.sendReminder(complaint, 3, "normal");
      if (reminder) reminders.push(reminder);
    }

    for (const complaint of pending7Days) {
      const reminder = await this.sendReminder(complaint, 7, "high");
      if (reminder) reminders.push(reminder);
    }

    for (const complaint of pending14Days) {
      const reminder = await this.sendReminder(complaint, 14, "critical");
      if (reminder) reminders.push(reminder);
      
      // Auto-escalate complaints pending for 14+ days
      await this.autoEscalate(complaint);
    }

    return reminders;
  }

  // Get complaints pending for exactly N days
  async getPendingComplaints(days) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date(startDate);
    endDate.setHours(23, 59, 59, 999);

    return await Complaint.find({
      status: { $in: ["pending", "in_progress"] },
      createdAt: { $gte: startDate, $lte: endDate },
      deletedAt: null,
    }).populate("studentId", "name email notificationPreferences");
  }

  // Send reminder to student
  async sendReminder(complaint, daysPending, priority) {
    try {
      // Check if reminder already sent today
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const existingReminder = await Notification.findOne({
        userId: complaint.studentId._id,
        complaintId: complaint._id,
        type: "reminder",
        createdAt: { $gte: today },
      });

      if (existingReminder) {
        return null; // Already sent today
      }

      // Check user preferences
      const preferences = complaint.studentId.notificationPreferences;
      if (preferences && !preferences.complaintUpdates) {
        return null;
      }

      const notification = await this.notificationService.createNotification({
        userId: complaint.studentId._id,
        type: "reminder",
        title: `Complaint Pending for ${daysPending} Days`,
        message: `Your complaint "${complaint.title}" has been pending for ${daysPending} days. We are working on it and will update you soon.`,
        complaintId: complaint._id,
        priority,
        actionUrl: `/student?complaint=${complaint._id}`,
        metadata: {
          daysPending,
          category: complaint.category,
        },
      });

      return notification;
    } catch (error) {
      console.error("Error sending reminder:", error);
      return null;
    }
  }

  // Auto-escalate long-pending complaints
  async autoEscalate(complaint) {
    const Escalation = require("../models/Escalation");
    
    const existingEscalation = await Escalation.findOne({
      complaintId: complaint._id,
      reason: "overdue",
      status: { $in: ["pending", "acknowledged"] },
    });

    if (!existingEscalation) {
      const EscalationService = require("./escalationService");
      const escalationService = new EscalationService(this.notificationService);
      
      await escalationService.createEscalation({
        complaintId: complaint._id,
        reason: "overdue",
        description: "Complaint pending for 14+ days - Auto escalated",
        escalatedBy: null,
        escalatedByRole: "system",
        level: 2,
      });
    }
  }

  // Send daily digest to admins
  async sendAdminDigest() {
    const stats = await this.getDailyStats();
    
    // This would typically query for admin users and send them the digest
    // For now, we'll just return the stats
    return stats;
  }

  // Get daily statistics
  async getDailyStats() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const stats = {
      newToday: await Complaint.countDocuments({
        createdAt: { $gte: today },
        deletedAt: null,
      }),
      resolvedToday: await Complaint.countDocuments({
        resolvedAt: { $gte: today },
        deletedAt: null,
      }),
      pending: await Complaint.countDocuments({
        status: "pending",
        deletedAt: null,
      }),
      inProgress: await Complaint.countDocuments({
        status: "in_progress",
        deletedAt: null,
      }),
      escalated: await Complaint.countDocuments({
        status: "escalated",
        deletedAt: null,
      }),
      overdue: await Complaint.countDocuments({
        status: { $in: ["pending", "in_progress"] },
        expectedCompletionDate: { $lt: new Date(), $ne: null },
        deletedAt: null,
      }),
    };

    return stats;
  }

  // Schedule weekly summary for students
  async sendWeeklySummaries() {
    const User = require("../models/User");
    
    const students = await User.find({
      role: "student",
      isActive: true,
      "notificationPreferences.weeklyDigest": true,
    });

    const summaries = [];
    for (const student of students) {
      const summary = await this.generateStudentSummary(student._id);
      if (summary.hasActivity) {
        const notification = await this.notificationService.createNotification({
          userId: student._id,
          type: "weekly_digest",
          title: "Weekly Complaint Summary",
          message: `You have ${summary.pendingCount} pending, ${summary.resolvedThisWeek} resolved this week.`,
          priority: "low",
          actionUrl: "/student",
          metadata: summary,
        });
        summaries.push(notification);
      }
    }

    return summaries;
  }

  // Generate summary for a student
  async generateStudentSummary(studentId) {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const complaints = await Complaint.find({
      studentId,
      deletedAt: null,
    });

    const pendingCount = complaints.filter(c => c.status === "pending").length;
    const inProgressCount = complaints.filter(c => c.status === "in_progress").length;
    const resolvedThisWeek = complaints.filter(
      c => c.status === "resolved" && c.resolvedAt && c.resolvedAt >= weekAgo
    ).length;
    const newThisWeek = complaints.filter(c => c.createdAt >= weekAgo).length;

    return {
      hasActivity: complaints.length > 0,
      totalComplaints: complaints.length,
      pendingCount,
      inProgressCount,
      resolvedThisWeek,
      newThisWeek,
    };
  }
}

module.exports = ReminderService;
