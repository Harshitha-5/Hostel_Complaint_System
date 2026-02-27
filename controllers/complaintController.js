const Complaint = require("../models/Complaint");
const ComplaintVersion = require("../models/ComplaintVersion");
const Notification = require("../models/Notification");
const FeatureToggle = require("../models/FeatureToggle");

const deletedFilter = { deletedAt: null };

// Helper: check if duplicate detection is enabled
const isDuplicateDetectionEnabled = async () => {
  const toggle = await FeatureToggle.findOne({ key: "duplicate_detection" });
  return !toggle || toggle.enabled;
};

// Create complaint with duplicate detection
const createComplaint = async (req, res) => {
  try {
    const { title, description, category, priority } = req.body;
    const studentId = req.user._id;

    if (!title || !description) {
      return res.status(400).json({
        success: false,
        message: "Title and description are required",
      });
    }

    if (title.length < 5 || title.length > 100) {
      return res.status(400).json({
        success: false,
        message: "Title must be between 5 and 100 characters",
      });
    }

    if (description.length < 10 || description.length > 1000) {
      return res.status(400).json({
        success: false,
        message: "Description must be between 10 and 1000 characters",
      });
    }

    // Smart duplicate complaint detection
    if (await isDuplicateDetectionEnabled()) {
      const normalizedTitle = title.trim().toLowerCase().replace(/\s+/g, " ");
      const normalizedDesc = description.trim().toLowerCase().slice(0, 200);

      const duplicateQuery = {
        ...deletedFilter,
        studentId,
        $or: [
          { title: { $regex: new RegExp(normalizedTitle.slice(0, 30), "i") } },
          { description: { $regex: new RegExp(normalizedDesc.slice(0, 50), "i") } },
        ],
        createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      };

      const similarComplaints = await Complaint.find(duplicateQuery)
        .sort({ createdAt: -1 })
        .limit(3)
        .select("_id title status createdAt");

      if (similarComplaints.length > 0) {
        return res.status(409).json({
          success: false,
          message:
            "A similar complaint was already submitted recently. Please review your existing complaints instead of creating a duplicate.",
          possibleDuplicateId: similarComplaints[0]._id,
          similarComplaints,
        });
      }
    }

    const images = [];
    if (req.files && req.files.length > 0) {
      req.files.forEach((file) => {
        images.push(`/uploads/${file.filename}`);
      });
    }

    const complaint = new Complaint({
      title,
      description,
      category: category || "other",
      priority: priority || "medium",
      studentId,
      images,
      approvalStatus: "pending_approval",
    });

    await complaint.save();

    const responsePayload = {
      ...complaint.toObject(),
      // Convenience field for single-proof UI usage
      proofImage: complaint.images && complaint.images.length > 0 ? complaint.images[0] : null,
    };

    // Emit new complaint to admins via Socket.io
    if (req.app.io) {
      req.app.io.to("admin").emit("complaintCreated", responsePayload);
    }

    res.status(201).json({
      success: true,
      message: "Complaint created successfully",
      complaint: responsePayload,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Get all complaints (exclude soft-deleted)
const getComplaints = async (req, res) => {
  try {
    const { status, search, sortBy = "createdAt", page = 1, limit = 50, includeDeleted } = req.query;
    let query = { ...deletedFilter };

    if (req.user.role === "admin" && includeDeleted === "true") {
      delete query.deletedAt;
    } else if (req.user.role === "student") {
      query.studentId = req.user._id;
    }

    if (status && status !== "all") query.status = status;
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const complaints = await Complaint.find(query)
      .populate("studentId", "name email")
      .sort({ [sortBy]: -1 })
      .skip(skip)
      .limit(Math.min(parseInt(limit) || 50, 100));

    const total = await Complaint.countDocuments(query);

    const complaintsWithProof = complaints.map((c) => ({
      ...c.toObject(),
      proofImage: c.images && c.images.length > 0 ? c.images[0] : null,
    }));

    res.status(200).json({
      success: true,
      complaints: complaintsWithProof,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / (parseInt(limit) || 50)),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Check duplicate before submit (optional endpoint for frontend)
const checkDuplicate = async (req, res) => {
  try {
    const { title, description } = req.query;
    if (!title || !description) {
      return res.status(400).json({ success: false, message: "Title and description required" });
    }
    const studentId = req.user._id;
    const normalizedTitle = title.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 40);
    const query = {
      ...deletedFilter,
      studentId,
      $or: [
        { title: { $regex: new RegExp(normalizedTitle, "i") } },
        { description: { $regex: new RegExp(description.trim().slice(0, 80), "i") } },
      ],
      createdAt: { $gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) },
    };

    const matches = await Complaint.find(query)
      .sort({ createdAt: -1 })
      .limit(5)
      .select("_id title status createdAt");

    const possible = matches[0] || null;
    res.status(200).json({
      success: true,
      isPossibleDuplicate: !!possible,
      existingId: possible ? possible._id : null,
      similarComplaints: matches,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get single complaint
const getComplaintById = async (req, res) => {
  try {
    const complaint = await Complaint.findOne({
      _id: req.params.id,
      ...deletedFilter,
    }).populate("studentId", "name email");

    if (!complaint) {
      return res.status(404).json({
        success: false,
        message: "Complaint not found",
      });
    }

    if (
      complaint.studentId._id.toString() !== req.user._id.toString() &&
      req.user.role !== "admin"
    ) {
      return res.status(403).json({
        success: false,
        message: "Not authorized",
      });
    }

    res.status(200).json({
      success: true,
      complaint,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Version history for complaint
const getVersionHistory = async (req, res) => {
  try {
    const complaint = await Complaint.findOne({
      _id: req.params.id,
      ...deletedFilter,
    });
    if (!complaint) {
      return res.status(404).json({ success: false, message: "Complaint not found" });
    }
    if (
      complaint.studentId.toString() !== req.user._id.toString() &&
      req.user.role !== "admin"
    ) {
      return res.status(403).json({ success: false, message: "Not authorized" });
    }

    const versions = await ComplaintVersion.find({ complaintId: req.params.id })
      .sort({ createdAt: -1 })
      .populate("changedBy", "name")
      .lean();

    res.status(200).json({ success: true, versions });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Save version snapshot helper
const saveVersionSnapshot = async (complaint, changedBy, changeReason) => {
  const version = (complaint.version || 1) + 1;
  await ComplaintVersion.create({
    complaintId: complaint._id,
    version,
    snapshot: {
      status: complaint.status,
      adminNotes: complaint.adminNotes,
      estimatedCost: complaint.estimatedCost,
      actualCost: complaint.actualCost,
      approvalStatus: complaint.approvalStatus,
    },
    changedBy: changedBy || null,
    changeReason: changeReason || "Status/notes update",
  });
  complaint.version = version;
  await complaint.save();
};

// Student: submit feedback after resolution (rating 1–5 + optional text)
const submitResolutionFeedback = async (req, res) => {
  try {
    const { rating, feedback } = req.body;
    const { id } = req.params;

    const numericRating = Number(rating);
    if (
      Number.isNaN(numericRating) ||
      numericRating < 1 ||
      numericRating > 5
    ) {
      return res.status(400).json({
        success: false,
        message: "Rating must be a number between 1 and 5",
      });
    }

    const complaint = await Complaint.findOne({
      _id: id,
      ...deletedFilter,
    });

    if (!complaint) {
      return res.status(404).json({
        success: false,
        message: "Complaint not found",
      });
    }

    if (complaint.studentId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to rate this complaint",
      });
    }

    if (complaint.status !== "resolved") {
      return res.status(400).json({
        success: false,
        message: "You can rate only resolved complaints",
      });
    }

    complaint.resolutionRating = numericRating;
    if (typeof feedback === "string") {
      complaint.resolutionFeedback = feedback.slice(0, 1000);
    }
    complaint.updatedAt = new Date();
    await complaint.save();

    const responsePayload = {
      ...complaint.toObject(),
      proofImage:
        complaint.images && complaint.images.length > 0
          ? complaint.images[0]
          : null,
    };

    return res.status(200).json({
      success: true,
      message: "Feedback submitted successfully",
      complaint: responsePayload,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Update complaint status (Admin) + version history + high-priority alert
// Also handles estimatedDays / expectedCompletionDate and emits real-time update
const updateComplaintStatus = async (req, res) => {
  try {
    const { status, adminNotes, estimatedCost, actualCost, estimatedDays } = req.body;
    const { id } = req.params;

    if (!status) {
      return res.status(400).json({
        success: false,
        message: "Status is required",
      });
    }

    if (!["pending", "in_progress", "resolved"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status value",
      });
    }

    const complaint = await Complaint.findOne({ _id: id, ...deletedFilter }).populate(
      "studentId",
      "name email"
    );

    if (!complaint) {
      return res.status(404).json({
        success: false,
        message: "Complaint not found",
      });
    }

    const previousStatus = complaint.status;
    complaint.status = status;

    if (adminNotes !== undefined) complaint.adminNotes = adminNotes;
    if (estimatedCost !== undefined) complaint.estimatedCost = estimatedCost;
    if (actualCost !== undefined) complaint.actualCost = actualCost;

    // Time estimation: days + expected completion date
    if (typeof estimatedDays === "number") {
      complaint.estimatedDays = estimatedDays;

      const baseDate = new Date();
      const expected = new Date(baseDate);
      expected.setDate(expected.getDate() + estimatedDays);
      complaint.expectedCompletionDate = expected;
    }

    complaint.updatedAt = new Date();

    if (status === "resolved") {
      complaint.resolvedAt = new Date();
    }

    await saveVersionSnapshot(complaint, req.user._id, `Status: ${previousStatus} → ${status}`);

    // Persist latest snapshot
    await complaint.save();

    const notificationMessage = `Your complaint "${complaint.title}" status updated to ${status}`;
    const notif = new Notification({
      userId: complaint.studentId._id || complaint.studentId,
      complaintId: complaint._id,
      message: notificationMessage,
      type: "status_update",
    });
    await notif.save();

    // Real-time high-priority alert for admins (student gets above; optional: push to admin channel)
    if (complaint.priority === "high" && (status === "in_progress" || status === "resolved")) {
      const alertNotif = new Notification({
        userId: complaint.studentId._id || complaint.studentId,
        complaintId: complaint._id,
        message: `High-priority complaint "${complaint.title}" is now ${status}.`,
        type: "high_priority_alert",
        priority: "high",
      });
      await alertNotif.save();
    }

    // Real-time push directly to the student's room
    if (req.app && req.app.io) {
      const studentRoom = `user:${complaint.studentId._id || complaint.studentId}`;
      req.app.io.to(studentRoom).emit("complaintStatusChanged", complaint.toObject());
    }

    res.status(200).json({
      success: true,
      message: "Complaint status updated successfully",
      complaint,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Update cost only
const updateComplaintCost = async (req, res) => {
  try {
    const { estimatedCost, actualCost } = req.body;
    const complaint = await Complaint.findOne({ _id: req.params.id, ...deletedFilter });
    if (!complaint) {
      return res.status(404).json({ success: false, message: "Complaint not found" });
    }
    if (estimatedCost !== undefined) complaint.estimatedCost = estimatedCost;
    if (actualCost !== undefined) complaint.actualCost = actualCost;
    complaint.updatedAt = new Date();
    await saveVersionSnapshot(complaint, req.user._id, "Cost update");
    res.status(200).json({ success: true, complaint });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Multi-level approval
const approveComplaint = async (req, res) => {
  try {
    const { action, rejectionReason } = req.body; // action: "approved" | "rejected"
    const complaint = await Complaint.findOne({ _id: req.params.id, ...deletedFilter });
    if (!complaint) {
      return res.status(404).json({ success: false, message: "Complaint not found" });
    }
    if (action === "approved") {
      complaint.approvalStatus = "approved";
      complaint.approvedBy = req.user._id;
      complaint.approvedAt = new Date();
      complaint.rejectionReason = "";
    } else if (action === "rejected") {
      complaint.approvalStatus = "rejected";
      complaint.rejectionReason = rejectionReason || "";
    } else {
      return res.status(400).json({ success: false, message: "Invalid action" });
    }
    complaint.updatedAt = new Date();
    await saveVersionSnapshot(complaint, req.user._id, `Approval: ${action}`);
    await complaint.save();
    res.status(200).json({ success: true, complaint });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Soft delete
const deleteComplaint = async (req, res) => {
  try {
    const complaint = await Complaint.findOne({ _id: req.params.id, ...deletedFilter });

    if (!complaint) {
      return res.status(404).json({
        success: false,
        message: "Complaint not found",
      });
    }

    if (
      complaint.studentId.toString() !== req.user._id.toString() &&
      req.user.role !== "admin"
    ) {
      return res.status(403).json({
        success: false,
        message: "Not authorized",
      });
    }

    // If admin is deleting, optionally enforce only resolved complaints
    if (req.user.role === "admin" && complaint.status !== "resolved") {
      return res.status(400).json({
        success: false,
        message: "Admins can only delete resolved complaints",
      });
    }

    complaint.deletedAt = new Date();
    complaint.deletedBy = req.user._id;
    await complaint.save();

    // Real-time notify the student that this complaint was deleted (e.g. from resolved list)
    if (req.app && req.app.io) {
      const studentRoom = `user:${complaint.studentId.toString()}`;
      req.app.io.to(studentRoom).emit("complaintDeleted", {
        complaintId: complaint._id,
      });
    }

    res.status(200).json({
      success: true,
      message: "Complaint deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Restore soft-deleted complaint (admin only)
const restoreComplaint = async (req, res) => {
  try {
    const complaint = await Complaint.findOne({
      _id: req.params.id,
      deletedAt: { $ne: null },
    });
    if (!complaint) {
      return res.status(404).json({
        success: false,
        message: "Complaint not found or not deleted",
      });
    }

    complaint.deletedAt = null;
    complaint.deletedBy = null;
    complaint.updatedAt = new Date();
    await complaint.save();

    res.status(200).json({
      success: true,
      message: "Complaint restored successfully",
      complaint,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = {
  createComplaint,
  getComplaints,
  getMyComplaints: async (req, res) => {
    // Student-specific endpoint to get their own complaints
    try {
      const { status, page = 1, limit = 20 } = req.query;
      let query = {
        ...deletedFilter,
        studentId: req.user._id,
      };

      if (status && status !== "all") {
        query.status = status;
      }

      const skip = (parseInt(page) - 1) * parseInt(limit);
      const complaints = await Complaint.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit));

      const complaintsWithProof = complaints.map((c) => ({
        ...c.toObject(),
        proofImage: c.images && c.images.length > 0 ? c.images[0] : null,
      }));

      const total = await Complaint.countDocuments(query);

      res.status(200).json({
        success: true,
        complaints: complaintsWithProof,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  },
  updateComplaint: async (req, res) => {
    // Student can update only their own complaints (before approval)
    try {
      const { title, description, category, priority } = req.body;
      const complaint = await Complaint.findOne({
        _id: req.params.id,
        ...deletedFilter,
      });

      if (!complaint) {
        return res.status(404).json({
          success: false,
          message: "Complaint not found",
        });
      }

      if (complaint.studentId.toString() !== req.user._id.toString()) {
        return res.status(403).json({
          success: false,
          message: "Not authorized to update this complaint",
        });
      }

      if (complaint.status !== "pending") {
        return res.status(400).json({
          success: false,
          message: "Can only update pending complaints",
        });
      }

      if (title) complaint.title = title;
      if (description) complaint.description = description;
      if (category) complaint.category = category;
      if (priority) complaint.priority = priority;
      complaint.updatedAt = new Date();

      await complaint.save();

      res.status(200).json({
        success: true,
        message: "Complaint updated successfully",
        complaint,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  },
  getAnalytics: async (req, res) => {
    // Admin analytics dashboard
    try {
      const totalComplaints = await Complaint.countDocuments(deletedFilter);
      const resolvedComplaints = await Complaint.countDocuments({
        ...deletedFilter,
        status: "resolved",
      });
      const activeComplaints = await Complaint.countDocuments({
        ...deletedFilter,
        status: { $in: ["pending", "in_progress"] },
      });
      const highPriorityComplaints = await Complaint.countDocuments({
        ...deletedFilter,
        priority: "high",
        status: { $ne: "resolved" },
      });

      const complaintsByCategory = await Complaint.aggregate([
        { $match: deletedFilter },
        {
          $group: {
            _id: "$category",
            count: { $sum: 1 },
          },
        },
      ]);

      const complaintsByStatus = await Complaint.aggregate([
        { $match: deletedFilter },
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
          },
        },
      ]);

      const complaintsByPriority = await Complaint.aggregate([
        { $match: deletedFilter },
        {
          $group: {
            _id: "$priority",
            count: { $sum: 1 },
          },
        },
      ]);

      const averageResolutionTime = await Complaint.aggregate([
        {
          $match: {
            ...deletedFilter,
            resolvedAt: { $ne: null },
          },
        },
        {
          $group: {
            _id: null,
            avgTime: {
              $avg: {
                $subtract: ["$resolvedAt", "$createdAt"],
              },
            },
          },
        },
      ]);

      const averageResolutionRating = await Complaint.aggregate([
        {
          $match: {
            ...deletedFilter,
            status: "resolved",
            resolutionRating: { $ne: null },
          },
        },
        {
          $group: {
            _id: null,
            avgRating: { $avg: "$resolutionRating" },
          },
        },
      ]);

      res.status(200).json({
        success: true,
        analytics: {
          totalComplaints,
          resolvedComplaints,
          activeComplaints,
          highPriorityComplaints,
          complaintsByCategory,
          complaintsByStatus,
          complaintsByPriority,
          averageResolutionTime:
            averageResolutionTime.length > 0
              ? Math.round(averageResolutionTime[0].avgTime / (1000 * 60 * 60 * 24))
              : 0,
          averageResolutionRating:
            averageResolutionRating.length > 0
              ? Number(averageResolutionRating[0].avgRating.toFixed(2))
              : null,
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  },
  getComplaintById,
  getVersionHistory,
  checkDuplicate,
  updateComplaintStatus,
  updateComplaintCost,
  approveComplaint,
  deleteComplaint,
  restoreComplaint,
  submitResolutionFeedback,
  submitComplaint: createComplaint,
  getAllComplaints: getComplaints,
};
