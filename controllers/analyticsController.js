const Complaint = require("../models/Complaint");

// Get complaint statistics
const getStatistics = async (req, res) => {
  try {
    const allComplaints = await Complaint.find().populate("studentId");

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
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = {
  getStatistics,
};
