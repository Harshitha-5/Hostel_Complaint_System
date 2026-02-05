const Complaint = require("../models/Complaint");
const Notification = require("../models/Notification");

// Create complaint
const createComplaint = async (req, res) => {
  try {
    const { title, description, category, priority } = req.body;
    const studentId = req.user._id;

    // Validation
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

    // Handle file uploads
    const images = [];
    if (req.files && req.files.length > 0) {
      req.files.forEach((file) => {
        images.push(`/uploads/${file.filename}`);
      });
    }

    const complaint = new Complaint({
      title,
      description,
      category,
      priority,
      studentId,
      images,
    });

    await complaint.save();

    res.status(201).json({
      success: true,
      message: "Complaint created successfully",
      complaint,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Get all complaints (Admin) or student's complaints
const getComplaints = async (req, res) => {
  try {
    const { status, search, sortBy = "createdAt", page = 1, limit = 10 } = req.query;
    let query = {};

    // If student, only get their complaints
    if (req.user.role === "student") {
      query.studentId = req.user._id;
    }

    // Filter by status
    if (status && status !== "all") {
      query.status = status;
    }

    // Search by title or description
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }

    const skip = (page - 1) * limit;

    const complaints = await Complaint.find(query)
      .populate("studentId", "name email")
      .sort({ [sortBy]: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Complaint.countDocuments(query);

    res.status(200).json({
      success: true,
      complaints,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Get single complaint
const getComplaintById = async (req, res) => {
  try {
    const complaint = await Complaint.findById(req.params.id).populate(
      "studentId",
      "name email"
    );

    if (!complaint) {
      return res.status(404).json({
        success: false,
        message: "Complaint not found",
      });
    }

    // Check if user is owner or admin
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

// Update complaint status (Admin only)
const updateComplaintStatus = async (req, res) => {
  try {
    const { status, adminNotes } = req.body;
    const { id } = req.params;

    if (!status) {
      return res.status(400).json({
        success: false,
        message: "Status is required",
      });
    }

    const complaint = await Complaint.findById(id);

    if (!complaint) {
      return res.status(404).json({
        success: false,
        message: "Complaint not found",
      });
    }

    complaint.status = status;
    complaint.adminNotes = adminNotes || complaint.adminNotes;
    complaint.updatedAt = new Date();

    if (status === "resolved") {
      complaint.resolvedAt = new Date();
    }

    await complaint.save();

    // Create notification for student
    const notificationMessage = `Your complaint "${complaint.title}" status updated to ${status}`;
    const notification = new Notification({
      userId: complaint.studentId,
      complaintId: complaint._id,
      message: notificationMessage,
      type: "status_update",
    });
    await notification.save();

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

// Delete complaint (Student can delete own, Admin can delete any)
const deleteComplaint = async (req, res) => {
  try {
    const complaint = await Complaint.findById(req.params.id);

    if (!complaint) {
      return res.status(404).json({
        success: false,
        message: "Complaint not found",
      });
    }

    // Check authorization
    if (
      complaint.studentId.toString() !== req.user._id.toString() &&
      req.user.role !== "admin"
    ) {
      return res.status(403).json({
        success: false,
        message: "Not authorized",
      });
    }

    await Complaint.findByIdAndDelete(req.params.id);

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

module.exports = {
  createComplaint,
  getComplaints,
  getComplaintById,
  updateComplaintStatus,
  deleteComplaint,
  submitComplaint: createComplaint,
  getAllComplaints: getComplaints,
};

