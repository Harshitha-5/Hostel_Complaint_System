const Complaint = require("../models/Complaint");
const Escalation = require("../models/Escalation");
const ActivityLog = require("../models/ActivityLog");

class EscalationService {
  constructor(notificationService) {
    this.notificationService = notificationService;
  }

  // Check for complaints that need escalation
  async checkAndEscalate() {
    const escalations = [];

    // 1. Check for overdue complaints
    const overdueEscalations = await this.checkOverdueComplaints();
    escalations.push(...overdueEscalations);

    // 2. Check for complaints with no response
    const noResponseEscalations = await this.checkNoResponseComplaints();
    escalations.push(...noResponseEscalations);

    // 3. Check for high priority complaints pending too long
    const highPriorityEscalations = await this.checkHighPriorityComplaints();
    escalations.push(...highPriorityEscalations);

    return escalations;
  }

  // Check for overdue complaints (past expected completion date)
  async checkOverdueComplaints() {
    const now = new Date();
    const complaints = await Complaint.find({
      status: { $in: ["pending", "in_progress"] },
      expectedCompletionDate: { $lt: now, $ne: null },
      deletedAt: null,
    }).populate("studentId", "name email");

    const escalations = [];
    for (const complaint of complaints) {
      // Check if already escalated for this reason
      const existingEscalation = await Escalation.findOne({
        complaintId: complaint._id,
        reason: "overdue",
        status: { $in: ["pending", "acknowledged"] },
      });

      if (!existingEscalation) {
        const escalation = await this.createEscalation({
          complaintId: complaint._id,
          reason: "overdue",
          description: `Complaint is overdue. Expected completion was ${complaint.expectedCompletionDate.toLocaleDateString()}`,
          escalatedBy: null, // System escalation
          escalatedByRole: "system",
          level: 1,
        });

        // Update complaint status
        complaint.status = "escalated";
        await complaint.save();

        escalations.push(escalation);
      }
    }

    return escalations;
  }

  // Check for complaints with no admin response (no comments/status updates)
  async checkNoResponseComplaints(daysThreshold = 3) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysThreshold);

    const ActivityLog = require("../models/ActivityLog");
    
    const complaints = await Complaint.find({
      status: "pending",
      createdAt: { $lt: cutoffDate },
      deletedAt: null,
    }).populate("studentId", "name email");

    const escalations = [];
    for (const complaint of complaints) {
      // Check for any admin activity
      const adminActivity = await ActivityLog.findOne({
        targetId: complaint._id,
        userRole: { $in: ["admin", "warden"] },
        createdAt: { $gte: complaint.createdAt },
      });

      if (!adminActivity) {
        const existingEscalation = await Escalation.findOne({
          complaintId: complaint._id,
          reason: "no_response",
          status: { $in: ["pending", "acknowledged"] },
        });

        if (!existingEscalation) {
          const escalation = await this.createEscalation({
            complaintId: complaint._id,
            reason: "no_response",
            description: `No admin response for ${daysThreshold} days since creation`,
            escalatedBy: null,
            escalatedByRole: "system",
            level: 1,
          });

          escalations.push(escalation);
        }
      }
    }

    return escalations;
  }

  // Check for high priority complaints pending too long
  async checkHighPriorityComplaints(hoursThreshold = 24) {
    const cutoffDate = new Date();
    cutoffDate.setHours(cutoffDate.getHours() - hoursThreshold);

    const complaints = await Complaint.find({
      priority: { $in: ["high", "critical"] },
      status: "pending",
      createdAt: { $lt: cutoffDate },
      deletedAt: null,
    }).populate("studentId", "name email");

    const escalations = [];
    for (const complaint of complaints) {
      const existingEscalation = await Escalation.findOne({
        complaintId: complaint._id,
        reason: "high_priority",
        status: { $in: ["pending", "acknowledged"] },
      });

      if (!existingEscalation) {
        const escalation = await this.createEscalation({
          complaintId: complaint._id,
          reason: "high_priority",
          description: `High priority complaint pending for over ${hoursThreshold} hours`,
          escalatedBy: null,
          escalatedByRole: "system",
          level: complaint.priority === "critical" ? 2 : 1,
        });

        escalations.push(escalation);
      }
    }

    return escalations;
  }

  // Create escalation
  async createEscalation({
    complaintId,
    reason,
    description,
    escalatedBy,
    escalatedByRole,
    level = 1,
  }) {
    try {
      const escalation = await Escalation.create({
        complaintId,
        reason,
        description,
        escalatedBy,
        escalatedByRole,
        level,
        status: "pending",
      });

      // Get complaint details for notification
      const complaint = await Complaint.findById(complaintId).populate("studentId");

      if (complaint) {
        // Log the escalation
        await ActivityLog.logActivity({
          userId: escalatedBy || complaint.studentId._id,
          userRole: escalatedByRole,
          userName: escalatedByRole === "system" ? "System" : "User",
          action: "complaint_escalated",
          targetId: complaintId,
          targetType: "complaint",
          description: `Complaint escalated to level ${level}. Reason: ${reason}`,
          changes: {
            before: { status: complaint.status },
            after: { status: "escalated" },
          },
        });

        // Send notifications
        if (this.notificationService) {
          await this.notificationService.notifyEscalation(
            escalation,
            complaint,
            {
              _id: escalatedBy || complaint.studentId._id,
              name: escalatedByRole === "system" ? "System" : "User",
              role: escalatedByRole,
            }
          );
        }
      }

      return escalation;
    } catch (error) {
      console.error("Error creating escalation:", error);
      return null;
    }
  }

  // Acknowledge escalation
  async acknowledgeEscalation(escalationId, adminId) {
    try {
      const escalation = await Escalation.findByIdAndUpdate(
        escalationId,
        {
          status: "acknowledged",
          assignedTo: adminId,
        },
        { new: true }
      );

      return escalation;
    } catch (error) {
      console.error("Error acknowledging escalation:", error);
      return null;
    }
  }

  // Resolve escalation
  async resolveEscalation(escalationId, adminId, resolutionNotes) {
    try {
      const escalation = await Escalation.findByIdAndUpdate(
        escalationId,
        {
          status: "resolved",
          resolvedBy: adminId,
          resolvedAt: new Date(),
          resolutionNotes,
        },
        { new: true }
      );

      return escalation;
    } catch (error) {
      console.error("Error resolving escalation:", error);
      return null;
    }
  }

  // Get pending escalations
  async getPendingEscalations(level = null) {
    const query = { status: { $in: ["pending", "acknowledged"] } };
    if (level) query.level = level;

    return await Escalation.find(query)
      .populate("complaintId")
      .populate("escalatedBy", "name role")
      .sort({ level: -1, createdAt: -1 });
  }

  // Manual escalation by student
  async requestEscalation(complaintId, studentId, reason) {
    const complaint = await Complaint.findOne({
      _id: complaintId,
      studentId,
    });

    if (!complaint) {
      throw new Error("Complaint not found or access denied");
    }

    // Check if already escalated
    const existingEscalation = await Escalation.findOne({
      complaintId,
      reason: "student_request",
      status: { $in: ["pending", "acknowledged"] },
    });

    if (existingEscalation) {
      throw new Error("Escalation already requested for this complaint");
    }

    return await this.createEscalation({
      complaintId,
      reason: "student_request",
      description: reason,
      escalatedBy: studentId,
      escalatedByRole: "student",
      level: 1,
    });
  }
}

module.exports = EscalationService;
