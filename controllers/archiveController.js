const Archive = require("../models/Archive");
const ArchiveService = require("../services/archiveService");

const archiveService = new ArchiveService();

// Archive a complaint
exports.archiveComplaint = async (req, res) => {
  try {
    const { complaintId } = req.params;
    const { reason = "manual" } = req.body;

    const archive = await archiveService.archiveComplaint(
      complaintId,
      req.user,
      reason,
      false
    );

    res.json({
      success: true,
      archive,
      message: "Complaint archived successfully",
    });
  } catch (error) {
    console.error("Error archiving complaint:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error archiving complaint",
    });
  }
};

// Restore an archived complaint
exports.restoreComplaint = async (req, res) => {
  try {
    const { archiveId } = req.params;
    const { reason = "" } = req.body;

    const result = await archiveService.restoreComplaint(archiveId, req.user, reason);

    res.json({
      success: true,
      complaint: result,
      message: "Complaint restored successfully",
    });
  } catch (error) {
    console.error("Error restoring complaint:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error restoring complaint",
    });
  }
};

// Search archives
exports.searchArchives = async (req, res) => {
  try {
    const {
      query = "",
      category = null,
      archiveReason = null,
      startDate = null,
      endDate = null,
      page = 1,
      limit = 20,
    } = req.query;

    const { archives, total } = await archiveService.searchArchives(query, {
      studentId: req.user.role === "student" ? req.user._id : null,
      category,
      archiveReason,
      startDate,
      endDate,
      limit: parseInt(limit),
      skip: (parseInt(page) - 1) * parseInt(limit),
    });

    res.json({
      success: true,
      archives,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error("Error searching archives:", error);
    res.status(500).json({
      success: false,
      message: "Error searching archives",
    });
  }
};

// Get archived complaint details
exports.getArchivedComplaint = async (req, res) => {
  try {
    const { archiveId } = req.params;

    const archive = await archiveService.getArchivedComplaint(archiveId);
    if (!archive) {
      return res.status(404).json({
        success: false,
        message: "Archived complaint not found",
      });
    }

    // Check access rights for students
    if (req.user.role === "student") {
      const studentId = archive.complaintData.studentId?.toString?.() || 
                        archive.complaintData.studentId;
      if (studentId !== req.user._id.toString()) {
        return res.status(403).json({
          success: false,
          message: "Access denied",
        });
      }
    }

    res.json({
      success: true,
      archive,
    });
  } catch (error) {
    console.error("Error fetching archived complaint:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching archived complaint",
    });
  }
};

// Get archive statistics
exports.getArchiveStats = async (req, res) => {
  try {
    const stats = await archiveService.getArchiveStats();

    res.json({
      success: true,
      stats,
    });
  } catch (error) {
    console.error("Error fetching archive stats:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching archive statistics",
    });
  }
};

// Trigger auto-archive
exports.triggerAutoArchive = async (req, res) => {
  try {
    const { days = 30 } = req.body;

    const archived = await archiveService.autoArchiveOldComplaints(parseInt(days));

    res.json({
      success: true,
      archived: archived.length,
      message: `${archived.length} complaints auto-archived`,
    });
  } catch (error) {
    console.error("Error triggering auto-archive:", error);
    res.status(500).json({
      success: false,
      message: "Error triggering auto-archive",
    });
  }
};

// Get student's archived complaints
exports.getStudentArchives = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;

    const { archives, total } = await archiveService.searchArchives("", {
      studentId: req.user._id,
      limit: parseInt(limit),
      skip: (parseInt(page) - 1) * parseInt(limit),
    });

    res.json({
      success: true,
      archives,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error("Error fetching student archives:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching archived complaints",
    });
  }
};
