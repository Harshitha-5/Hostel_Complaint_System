const Escalation = require("../models/Escalation");
const Complaint = require("../models/Complaint");
const EscalationService = require("../services/escalationService");
const NotificationService = require("../services/notificationService");

const escalationService = new EscalationService();

// Get all escalations (admin only)
exports.getEscalations = async (req, res) => {
  try {
    const { status = "all", level = null, page = 1, limit = 20 } = req.query;

    const query = {};
    if (status !== "all") query.status = status;
    if (level) query.level = parseInt(level);

    const escalations = await Escalation.find(query)
      .populate("complaintId")
      .populate("escalatedBy", "name role")
      .populate("assignedTo", "name role")
      .populate("resolvedBy", "name role")
      .sort({ level: -1, createdAt: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit));

    const total = await Escalation.countDocuments(query);

    res.json({
      success: true,
      escalations,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error("Error fetching escalations:", error);
    res.status(500).json({ success: false, message: "Error fetching escalations" });
  }
};

// Get student's escalations
exports.getStudentEscalations = async (req, res) => {
  try {
    // Find complaints by this student
    const complaints = await Complaint.find({ studentId: req.user._id });
    const complaintIds = complaints.map(c => c._id);

    const escalations = await Escalation.find({
      complaintId: { $in: complaintIds },
    })
      .populate("complaintId", "title status")
      .populate("escalatedBy", "name role")
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      escalations,
    });
  } catch (error) {
    console.error("Error fetching student escalations:", error);
    res.status(500).json({ success: false, message: "Error fetching escalations" });
  }
};

// Create escalation (manual by student)
exports.createEscalation = async (req, res) => {
  try {
    const { complaintId } = req.params;
    const { reason } = req.body;

    if (!reason || reason.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: "Escalation reason is required",
      });
    }

    const io = req.app.io;
    escalationService.notificationService = new NotificationService(io);

    const escalation = await escalationService.requestEscalation(
      complaintId,
      req.user._id,
      reason
    );

    res.status(201).json({
      success: true,
      escalation,
      message: "Escalation request submitted successfully",
    });
  } catch (error) {
    console.error("Error creating escalation:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error creating escalation",
    });
  }
};

// Acknowledge escalation (admin)
exports.acknowledgeEscalation = async (req, res) => {
  try {
    const { escalationId } = req.params;

    const escalation = await escalationService.acknowledgeEscalation(
      escalationId,
      req.user._id
    );

    if (!escalation) {
      return res.status(404).json({
        success: false,
        message: "Escalation not found",
      });
    }

    res.json({
      success: true,
      escalation,
      message: "Escalation acknowledged",
    });
  } catch (error) {
    console.error("Error acknowledging escalation:", error);
    res.status(500).json({
      success: false,
      message: "Error acknowledging escalation",
    });
  }
};

// Resolve escalation (admin)
exports.resolveEscalation = async (req, res) => {
  try {
    const { escalationId } = req.params;
    const { resolutionNotes } = req.body;

    const escalation = await escalationService.resolveEscalation(
      escalationId,
      req.user._id,
      resolutionNotes
    );

    if (!escalation) {
      return res.status(404).json({
        success: false,
        message: "Escalation not found",
      });
    }

    res.json({
      success: true,
      escalation,
      message: "Escalation resolved",
    });
  } catch (error) {
    console.error("Error resolving escalation:", error);
    res.status(500).json({
      success: false,
      message: "Error resolving escalation",
    });
  }
};

// Get escalation statistics
exports.getEscalationStats = async (req, res) => {
  try {
    const stats = await Escalation.aggregate([
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]);

    const byReason = await Escalation.aggregate([
      {
        $group: {
          _id: "$reason",
          count: { $sum: 1 },
        },
      },
    ]);

    const byLevel = await Escalation.aggregate([
      {
        $group: {
          _id: "$level",
          count: { $sum: 1 },
        },
      },
    ]);

    const totalPending = await Escalation.countDocuments({
      status: { $in: ["pending", "acknowledged"] },
    });

    res.json({
      success: true,
      stats: {
        byStatus: stats,
        byReason,
        byLevel,
        totalPending,
      },
    });
  } catch (error) {
    console.error("Error fetching escalation stats:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching escalation statistics",
    });
  }
};

// Trigger automatic escalation check
exports.triggerAutoEscalation = async (req, res) => {
  try {
    const io = req.app.io;
    escalationService.notificationService = new NotificationService(io);

    const escalations = await escalationService.checkAndEscalate();

    res.json({
      success: true,
      escalationsCreated: escalations.length,
      message: `${escalations.length} complaints escalated automatically`,
    });
  } catch (error) {
    console.error("Error triggering auto-escalation:", error);
    res.status(500).json({
      success: false,
      message: "Error triggering auto-escalation",
    });
  }
};
