const Complaint = require("../models/Complaint");
const Archive = require("../models/Archive");
const Comment = require("../models/Comment");
const ActivityLog = require("../models/ActivityLog");
const ActivityLogModel = require("../models/ActivityLog");

class ArchiveService {
  // Archive a complaint
  async archiveComplaint(complaintId, archivedBy, archiveReason = "resolved", autoArchived = false) {
    try {
      const complaint = await Complaint.findById(complaintId)
        .populate("studentId", "name email roomNo hostel")
        .populate("assignedTo", "name role")
        .populate("assignedBy", "name role");

      if (!complaint) {
        throw new Error("Complaint not found");
      }

      // Check if already archived
      const existingArchive = await Archive.findOne({ originalComplaintId: complaintId });
      if (existingArchive && !existingArchive.restoredAt) {
        throw new Error("Complaint is already archived");
      }

      // Get related data
      const [comments, activityLogs] = await Promise.all([
        Comment.find({ complaintId }).sort({ createdAt: -1 }),
        ActivityLogModel.find({ targetId: complaintId }).sort({ createdAt: -1 }),
      ]);

      // Calculate metrics
      const resolutionTimeDays = complaint.resolvedAt
        ? (new Date(complaint.resolvedAt) - new Date(complaint.createdAt)) / (1000 * 60 * 60 * 24)
        : null;

      // Create archive
      const archive = await Archive.create({
        originalComplaintId: complaintId,
        complaintData: complaint.toObject(),
        comments: comments.map(c => c.toObject()),
        activityLogs: activityLogs.map(a => a.toObject()),
        archivedBy: archivedBy._id || archivedBy,
        archivedByRole: archivedBy.role || "system",
        archiveReason,
        autoArchived,
        retentionUntil: this.calculateRetentionDate(archiveReason),
        tags: this.generateTags(complaint),
        metrics: {
          resolutionTimeDays: resolutionTimeDays ? Math.round(resolutionTimeDays * 10) / 10 : null,
          totalComments: comments.length,
          escalationsCount: activityLogs.filter(a => a.action === "complaint_escalated").length,
          finalRating: complaint.resolutionRating,
        },
      });

      // Soft delete the original complaint
      complaint.deletedAt = new Date();
      complaint.deletedBy = archivedBy._id || archivedBy;
      await complaint.save();

      // Log the archive
      await ActivityLogModel.logActivity({
        userId: archivedBy._id || archivedBy,
        userRole: archivedBy.role || "system",
        userName: archivedBy.name || "System",
        action: "complaint_archived",
        targetId: complaintId,
        targetType: "complaint",
        description: `Complaint archived. Reason: ${archiveReason}`,
        metadata: {
          archiveId: archive._id,
          archiveReason,
          autoArchived,
        },
      });

      return archive;
    } catch (error) {
      console.error("Error archiving complaint:", error);
      throw error;
    }
  }

  // Restore an archived complaint
  async restoreComplaint(archiveId, restoredBy, restoreReason = "") {
    try {
      const archive = await Archive.findById(archiveId);
      if (!archive) {
        throw new Error("Archive not found");
      }

      if (archive.restoredAt) {
        throw new Error("Complaint has already been restored");
      }

      // Restore the complaint
      const complaint = await Complaint.findByIdAndUpdate(
        archive.originalComplaintId,
        {
          deletedAt: null,
          deletedBy: null,
          status: "pending", // Reset to pending for re-evaluation
          updatedAt: new Date(),
        },
        { new: true }
      );

      if (!complaint) {
        // If complaint was hard deleted, recreate it
        const restoredData = { ...archive.complaintData };
        delete restoredData._id;
        delete restoredData.deletedAt;
        delete restoredData.deletedBy;
        restoredData.status = "pending";
        restoredData.createdAt = new Date();
        restoredData.updatedAt = new Date();

        const newComplaint = await Complaint.create(restoredData);
        
        // Update archive with new complaint ID
        archive.originalComplaintId = newComplaint._id;
      }

      // Mark archive as restored
      archive.restoredAt = new Date();
      archive.restoredBy = restoredBy._id || restoredBy;
      archive.restoreReason = restoreReason;
      await archive.save();

      // Log the restoration
      await ActivityLogModel.logActivity({
        userId: restoredBy._id || restoredBy,
        userRole: restoredBy.role || "admin",
        userName: restoredBy.name || "Admin",
        action: "complaint_restored",
        targetId: archive.originalComplaintId,
        targetType: "complaint",
        description: `Complaint restored from archive. Reason: ${restoreReason}`,
        metadata: {
          archiveId: archive._id,
          restoreReason,
        },
      });

      return complaint || archive;
    } catch (error) {
      console.error("Error restoring complaint:", error);
      throw error;
    }
  }

  // Auto-archive old resolved complaints
  async autoArchiveOldComplaints(daysOld = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const oldComplaints = await Complaint.find({
      status: "resolved",
      resolvedAt: { $lt: cutoffDate },
      deletedAt: null,
    });

    const archived = [];
    for (const complaint of oldComplaints) {
      try {
        const archive = await this.archiveComplaint(
          complaint._id,
          { _id: null, role: "system", name: "System" },
          "auto_archive",
          true
        );
        archived.push(archive);
      } catch (error) {
        console.error(`Failed to auto-archive complaint ${complaint._id}:`, error.message);
      }
    }

    return archived;
  }

  // Search archived complaints
  async searchArchives(query, options = {}) {
    const { 
      studentId = null, 
      category = null, 
      archiveReason = null, 
      startDate = null, 
      endDate = null,
      limit = 20, 
      skip = 0 
    } = options;

    const searchQuery = {};

    // Text search
    if (query) {
      searchQuery.$text = { $search: query };
    }

    // Filters
    if (studentId) {
      searchQuery["complaintData.studentId"] = studentId;
    }
    if (category) {
      searchQuery["complaintData.category"] = category;
    }
    if (archiveReason) {
      searchQuery.archiveReason = archiveReason;
    }
    if (startDate || endDate) {
      searchQuery.createdAt = {};
      if (startDate) searchQuery.createdAt.$gte = new Date(startDate);
      if (endDate) searchQuery.createdAt.$lte = new Date(endDate);
    }

    // Only show non-restored archives
    searchQuery.restoredAt = null;

    const archives = await Archive.find(searchQuery)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Archive.countDocuments(searchQuery);

    return { archives, total };
  }

  // Get archive statistics
  async getArchiveStats() {
    const stats = await Archive.aggregate([
      {
        $match: { restoredAt: null },
      },
      {
        $group: {
          _id: null,
          totalArchived: { $sum: 1 },
          avgResolutionTime: { $avg: "$metrics.resolutionTimeDays" },
          avgRating: { $avg: "$metrics.finalRating" },
          totalComments: { $sum: "$metrics.totalComments" },
        },
      },
    ]);

    const byReason = await Archive.aggregate([
      {
        $match: { restoredAt: null },
      },
      {
        $group: {
          _id: "$archiveReason",
          count: { $sum: 1 },
        },
      },
    ]);

    const byCategory = await Archive.aggregate([
      {
        $match: { restoredAt: null },
      },
      {
        $group: {
          _id: "$complaintData.category",
          count: { $sum: 1 },
        },
      },
    ]);

    return {
      overview: stats[0] || {
        totalArchived: 0,
        avgResolutionTime: 0,
        avgRating: 0,
        totalComments: 0,
      },
      byReason,
      byCategory,
    };
  }

  // Get archived complaint by ID
  async getArchivedComplaint(archiveId) {
    return await Archive.findById(archiveId);
  }

  // Calculate retention date based on reason
  calculateRetentionDate(archiveReason) {
    const retentionPeriods = {
      resolved: 365 * 2, // 2 years
      auto_archive: 365, // 1 year
      duplicate: 180, // 6 months
      spam: 90, // 3 months
      withdrawn: 180, // 6 months
      manual: 365 * 2, // 2 years
    };

    const days = retentionPeriods[archiveReason] || 365;
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date;
  }

  // Generate tags for archived complaint
  generateTags(complaint) {
    const tags = [];
    
    if (complaint.priority === "high" || complaint.priority === "critical") {
      tags.push("high-priority");
    }
    
    if (complaint.resolutionRating) {
      if (complaint.resolutionRating >= 4) tags.push("positive-feedback");
      if (complaint.resolutionRating <= 2) tags.push("negative-feedback");
    }
    
    if (complaint.estimatedCost || complaint.actualCost) {
      tags.push("has-cost");
    }
    
    tags.push(complaint.category);
    tags.push(complaint.status);
    
    return tags;
  }

  // Permanently delete expired archives
  async deleteExpiredArchives() {
    const expiredArchives = await Archive.find({
      retentionUntil: { $lt: new Date() },
      restoredAt: null,
    });

    const deleted = [];
    for (const archive of expiredArchives) {
      await Archive.findByIdAndDelete(archive._id);
      deleted.push(archive._id);
    }

    return deleted;
  }
}

module.exports = ArchiveService;
