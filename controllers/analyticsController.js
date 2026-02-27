const Complaint = require("../models/Complaint");

const deletedFilter = { deletedAt: null };

// Admin dashboard stats used by /api/admin/stats
// Returns a compact statistics object tailored for the main cards
const getAdminStats = async (req, res) => {
  try {
    const totalComplaints = await Complaint.countDocuments(deletedFilter);

    const resolvedCount = await Complaint.countDocuments({
      ...deletedFilter,
      status: "resolved",
    });

    // High-priority complaints which are NOT yet resolved
    const highPriorityCount = await Complaint.countDocuments({
      ...deletedFilter,
      priority: "high",
      status: { $ne: "resolved" },
    });

    // Average resolution time in days for resolved complaints only
    const avgResolutionAgg = await Complaint.aggregate([
      {
        $match: {
          ...deletedFilter,
          status: "resolved",
          resolvedAt: { $ne: null },
        },
      },
      {
        $group: {
          _id: null,
          avgTimeMs: { $avg: { $subtract: ["$resolvedAt", "$createdAt"] } },
        },
      },
    ]);

    const avgResolutionTime =
      avgResolutionAgg.length > 0
        ? Math.round(
            avgResolutionAgg[0].avgTimeMs / (1000 * 60 * 60 * 24)
          )
        : 0;

    return res.status(200).json({
      success: true,
      totalComplaints,
      resolvedCount,
      highPriorityCount,
      avgResolutionTime,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Get complaint statistics (exclude soft-deleted) - rich analytics object
const getStatistics = async (req, res) => {
  try {
    const allComplaints = await Complaint.find(deletedFilter).populate("studentId");

    // Basic stats
    const stats = {
      total: allComplaints.length,
      pending: allComplaints.filter((c) => c.status === "pending").length,
      inProgress: allComplaints.filter((c) => c.status === "in_progress").length,
      resolved: allComplaints.filter((c) => c.status === "resolved").length,
    };

    // Category distribution
    const categoryData = {};
    allComplaints.forEach((complaint) => {
      categoryData[complaint.category] =
        (categoryData[complaint.category] || 0) + 1;
    });

    // Priority distribution
    const priorityData = {};
    allComplaints.forEach((complaint) => {
      priorityData[complaint.priority] =
        (priorityData[complaint.priority] || 0) + 1;
    });

    // Status trend (by week)
    const statusTrend = [];
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toLocaleDateString();

      const dayComplaints = allComplaints.filter(
        (c) => new Date(c.createdAt).toLocaleDateString() === dateStr
      );

      statusTrend.push({
        date: dateStr,
        pending: dayComplaints.filter((c) => c.status === "pending").length,
        inProgress: dayComplaints.filter((c) => c.status === "in_progress")
          .length,
        resolved: dayComplaints.filter((c) => c.status === "resolved").length,
        total: dayComplaints.length,
      });
    }

    // Average resolution time
    const resolvedComplaints = allComplaints.filter((c) => c.resolvedAt);
    let avgResolutionTime = 0;
    if (resolvedComplaints.length > 0) {
      const totalTime = resolvedComplaints.reduce((acc, complaint) => {
        const resolutionTime =
          new Date(complaint.resolvedAt) - new Date(complaint.createdAt);
        return acc + resolutionTime;
      }, 0);
      avgResolutionTime = Math.round(
        totalTime / resolvedComplaints.length / (1000 * 60 * 60 * 24)
      ); // in days
    }

    // Budget: total estimated & actual (maintenance budget tracking)
    let totalEstimatedCost = 0;
    let totalActualCost = 0;
    allComplaints.forEach((c) => {
      if (c.estimatedCost) totalEstimatedCost += c.estimatedCost;
      if (c.actualCost) totalActualCost += c.actualCost;
    });

    res.status(200).json({
      success: true,
      stats,
      categoryDistribution: Object.entries(categoryData).map(([name, value]) => ({
        name,
        value,
      })),
      priorityDistribution: Object.entries(priorityData).map(([name, value]) => ({
        name,
        value,
      })),
      statusTrend,
      avgResolutionTime,
      budgetSummary: {
        totalEstimatedCost,
        totalActualCost,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const getPublicStatistics = async (req, res) => {
  try {
    const totalComplaints = await Complaint.countDocuments(deletedFilter);
    const resolvedComplaints = await Complaint.countDocuments({ ...deletedFilter, status: "resolved" });
    const User = require("../models/User");
    const totalUsers = await User.countDocuments();

    // Calculate average resolution time (simplified)
    const resolvedData = await Complaint.find({ ...deletedFilter, status: "resolved", resolvedAt: { $exists: true } });
    let avgResolutionTime = 0;
    if (resolvedData.length > 0) {
      const totalTime = resolvedData.reduce((acc, c) => acc + (new Date(c.resolvedAt) - new Date(c.createdAt)), 0);
      avgResolutionTime = Math.round(totalTime / resolvedData.length / (1000 * 60 * 60)); // in hours
    }

    res.status(200).json({
      success: true,
      totalComplaints,
      resolvedComplaints,
      totalUsers,
      avgResolutionTime
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getAdminStats,
  getStatistics,
  getPublicStatistics,
};
