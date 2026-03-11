const Complaint = require("../models/Complaint");
const User = require("../models/User");
const ActivityLog = require("../models/ActivityLog");

class AnalyticsService {
  // Get comprehensive dashboard analytics
  async getDashboardAnalytics(timeRange = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - timeRange);

    const [
      overviewStats,
      categoryDistribution,
      statusDistribution,
      priorityDistribution,
      timeTrends,
      resolutionMetrics,
      topComplainers,
      performanceByCategory,
      peakHours,
      satisfactionMetrics,
    ] = await Promise.all([
      this.getOverviewStats(startDate),
      this.getCategoryDistribution(startDate),
      this.getStatusDistribution(),
      this.getPriorityDistribution(),
      this.getTimeTrends(timeRange),
      this.getResolutionMetrics(startDate),
      this.getTopComplainers(startDate, 5),
      this.getPerformanceByCategory(startDate),
      this.getPeakHours(timeRange),
      this.getSatisfactionMetrics(startDate),
    ]);

    return {
      overview: overviewStats,
      categories: categoryDistribution,
      status: statusDistribution,
      priority: priorityDistribution,
      trends: timeTrends,
      resolution: resolutionMetrics,
      topComplainers,
      performanceByCategory,
      peakHours,
      satisfaction: satisfactionMetrics,
      generatedAt: new Date(),
      timeRange,
    };
  }

  // Get overview statistics
  async getOverviewStats(startDate) {
    const totalComplaints = await Complaint.countDocuments({
      createdAt: { $gte: startDate },
      deletedAt: null,
    });

    const resolvedComplaints = await Complaint.countDocuments({
      status: "resolved",
      resolvedAt: { $gte: startDate },
      deletedAt: null,
    });

    const activeComplaints = await Complaint.countDocuments({
      status: { $in: ["pending", "in_progress", "escalated"] },
      deletedAt: null,
    });

    const highPriorityComplaints = await Complaint.countDocuments({
      priority: { $in: ["high", "critical"] },
      status: { $ne: "resolved" },
      deletedAt: null,
    });

    const escalatedComplaints = await Complaint.countDocuments({
      status: "escalated",
      deletedAt: null,
    });

    const overdueComplaints = await Complaint.countDocuments({
      status: { $in: ["pending", "in_progress"] },
      expectedCompletionDate: { $lt: new Date(), $ne: null },
      deletedAt: null,
    });

    return {
      totalComplaints,
      resolvedComplaints,
      activeComplaints,
      highPriorityComplaints,
      escalatedComplaints,
      overdueComplaints,
      resolutionRate: totalComplaints > 0 
        ? Math.round((resolvedComplaints / totalComplaints) * 100) 
        : 0,
    };
  }

  // Get category distribution
  async getCategoryDistribution(startDate) {
    const distribution = await Complaint.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate },
          deletedAt: null,
        },
      },
      {
        $group: {
          _id: "$category",
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
    ]);

    const categoryLabels = {
      cleaning: "Cleaning",
      maintenance: "Maintenance",
      food: "Food",
      water: "Water",
      electricity: "Electricity",
      electrical: "Electrical",
      plumbing: "Plumbing",
      furniture: "Furniture",
      internet: "Internet",
      security: "Security",
      other: "Other",
      others: "Others",
    };

    return distribution.map(item => ({
      category: categoryLabels[item._id] || item._id,
      count: item.count,
      percentage: 0, // Will be calculated by frontend
    }));
  }

  // Get status distribution
  async getStatusDistribution() {
    const distribution = await Complaint.aggregate([
      {
        $match: {
          deletedAt: null,
        },
      },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]);

    const statusLabels = {
      pending: "Pending",
      in_progress: "In Progress",
      resolved: "Resolved",
      on_hold: "On Hold",
      escalated: "Escalated",
    };

    return distribution.map(item => ({
      status: statusLabels[item._id] || item._id,
      count: item.count,
    }));
  }

  // Get priority distribution
  async getPriorityDistribution() {
    const distribution = await Complaint.aggregate([
      {
        $match: {
          deletedAt: null,
        },
      },
      {
        $group: {
          _id: "$priority",
          count: { $sum: 1 },
        },
      },
    ]);

    const priorityLabels = {
      low: "Low",
      medium: "Medium",
      high: "High",
      critical: "Critical",
    };

    return distribution.map(item => ({
      priority: priorityLabels[item._id] || item._id,
      count: item.count,
    }));
  }

  // Get time trends (complaints per day)
  async getTimeTrends(days = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const trends = await Complaint.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate },
          deletedAt: null,
        },
      },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
            day: { $dayOfMonth: "$createdAt" },
          },
          count: { $sum: 1 },
          resolved: {
            $sum: { $cond: [{ $eq: ["$status", "resolved"] }, 1, 0] },
          },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 } },
    ]);

    return trends.map(item => ({
      date: `${item._id.year}-${String(item._id.month).padStart(2, "0")}-${String(item._id.day).padStart(2, "0")}`,
      total: item.count,
      resolved: item.resolved,
    }));
  }

  // Get resolution metrics
  async getResolutionMetrics(startDate) {
    const resolvedComplaints = await Complaint.find({
      status: "resolved",
      resolvedAt: { $gte: startDate },
      deletedAt: null,
    });

    if (resolvedComplaints.length === 0) {
      return {
        averageResolutionTime: 0,
        fastestResolution: 0,
        slowestResolution: 0,
        totalResolved: 0,
      };
    }

    const resolutionTimes = resolvedComplaints.map(c => {
      const created = new Date(c.createdAt);
      const resolved = new Date(c.resolvedAt);
      return (resolved - created) / (1000 * 60 * 60 * 24); // Days
    });

    const avgTime = resolutionTimes.reduce((a, b) => a + b, 0) / resolutionTimes.length;

    return {
      averageResolutionTime: Math.round(avgTime * 10) / 10,
      fastestResolution: Math.round(Math.min(...resolutionTimes) * 10) / 10,
      slowestResolution: Math.round(Math.max(...resolutionTimes) * 10) / 10,
      totalResolved: resolvedComplaints.length,
    };
  }

  // Get top complainers
  async getTopComplainers(startDate, limit = 5) {
    return await Complaint.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate },
          deletedAt: null,
        },
      },
      {
        $group: {
          _id: "$studentId",
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
      { $limit: limit },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "student",
        },
      },
      { $unwind: "$student" },
      {
        $project: {
          studentId: "$_id",
          name: "$student.name",
          email: "$student.email",
          roomNo: "$student.roomNo",
          hostel: "$student.hostel",
          complaintCount: "$count",
        },
      },
    ]);
  }

  // Get performance by category
  async getPerformanceByCategory(startDate) {
    const categories = ["cleaning", "maintenance", "food", "water", "electricity", "plumbing", "furniture", "internet", "other"];
    
    const performance = [];
    for (const category of categories) {
      const total = await Complaint.countDocuments({
        category,
        createdAt: { $gte: startDate },
        deletedAt: null,
      });

      const resolved = await Complaint.countDocuments({
        category,
        status: "resolved",
        resolvedAt: { $gte: startDate },
        deletedAt: null,
      });

      const avgResolutionTime = await this.getAvgResolutionTimeByCategory(category, startDate);

      performance.push({
        category,
        total,
        resolved,
        resolutionRate: total > 0 ? Math.round((resolved / total) * 100) : 0,
        avgResolutionTime,
      });
    }

    return performance.sort((a, b) => b.total - a.total);
  }

  // Get average resolution time by category
  async getAvgResolutionTimeByCategory(category, startDate) {
    const complaints = await Complaint.find({
      category,
      status: "resolved",
      resolvedAt: { $gte: startDate },
      deletedAt: null,
    });

    if (complaints.length === 0) return 0;

    const totalDays = complaints.reduce((sum, c) => {
      const created = new Date(c.createdAt);
      const resolved = new Date(c.resolvedAt);
      return sum + (resolved - created) / (1000 * 60 * 60 * 24);
    }, 0);

    return Math.round((totalDays / complaints.length) * 10) / 10;
  }

  // Get peak complaint hours
  async getPeakHours(days = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const hourlyDistribution = await Complaint.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate },
          deletedAt: null,
        },
      },
      {
        $group: {
          _id: { $hour: "$createdAt" },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    return hourlyDistribution.map(item => ({
      hour: item._id,
      count: item.count,
      label: `${String(item._id).padStart(2, "0")}:00`,
    }));
  }

  // Get satisfaction metrics
  async getSatisfactionMetrics(startDate) {
    const ratedComplaints = await Complaint.find({
      resolutionRating: { $ne: null },
      resolvedAt: { $gte: startDate },
      deletedAt: null,
    });

    if (ratedComplaints.length === 0) {
      return {
        averageRating: 0,
        totalRated: 0,
        ratingDistribution: [0, 0, 0, 0, 0],
      };
    }

    const ratings = ratedComplaints.map(c => c.resolutionRating);
    const avgRating = ratings.reduce((a, b) => a + b, 0) / ratings.length;

    const distribution = [0, 0, 0, 0, 0];
    ratings.forEach(r => {
      distribution[r - 1]++;
    });

    return {
      averageRating: Math.round(avgRating * 10) / 10,
      totalRated: ratedComplaints.length,
      ratingDistribution: distribution,
    };
  }

  // Get recurring issues (same student, same category, within time period)
  async getRecurringIssues(studentId = null, days = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const matchStage = {
      createdAt: { $gte: startDate },
      deletedAt: null,
    };
    if (studentId) matchStage.studentId = studentId;

    return await Complaint.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: {
            studentId: "$studentId",
            category: "$category",
          },
          count: { $sum: 1 },
          complaints: { $push: "$_id" },
        },
      },
      { $match: { count: { $gt: 1 } } },
      { $sort: { count: -1 } },
      {
        $lookup: {
          from: "users",
          localField: "_id.studentId",
          foreignField: "_id",
          as: "student",
        },
      },
      { $unwind: "$student" },
      {
        $project: {
          studentId: "$_id.studentId",
          studentName: "$student.name",
          category: "$_id.category",
          complaintCount: "$count",
          complaintIds: "$complaints",
        },
      },
    ]);
  }

  // Get staff performance metrics
  async getStaffPerformance(startDate) {
    return await ActivityLog.aggregate([
      {
        $match: {
          action: { $in: ["complaint_resolved", "status_changed"] },
          userRole: { $in: ["admin", "warden"] },
          createdAt: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: "$userId",
          actionsCount: { $sum: 1 },
          complaintsResolved: {
            $sum: { $cond: [{ $eq: ["$action", "complaint_resolved"] }, 1, 0] },
          },
        },
      },
      { $sort: { complaintsResolved: -1 } },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "user",
        },
      },
      { $unwind: "$user" },
      {
        $project: {
          userId: "$_id",
          name: "$user.name",
          role: "$user.role",
          actionsCount: 1,
          complaintsResolved: 1,
        },
      },
    ]);
  }

  // Get predictive insights
  async getPredictiveInsights() {
    const now = new Date();
    const lastMonth = new Date(now);
    lastMonth.setMonth(lastMonth.getMonth() - 1);

    const twoMonthsAgo = new Date(now);
    twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);

    // Compare last month with previous month
    const lastMonthCount = await Complaint.countDocuments({
      createdAt: { $gte: lastMonth, $lt: now },
      deletedAt: null,
    });

    const previousMonthCount = await Complaint.countDocuments({
      createdAt: { $gte: twoMonthsAgo, $lt: lastMonth },
      deletedAt: null,
    });

    const trend = previousMonthCount > 0
      ? ((lastMonthCount - previousMonthCount) / previousMonthCount) * 100
      : 0;

    // Predict next week's volume based on last week's
    const lastWeek = new Date(now);
    lastWeek.setDate(lastWeek.getDate() - 7);

    const twoWeeksAgo = new Date(now);
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

    const lastWeekCount = await Complaint.countDocuments({
      createdAt: { $gte: lastWeek },
      deletedAt: null,
    });

    return {
      monthlyTrend: Math.round(trend * 10) / 10,
      predictedNextWeek: lastWeekCount,
      busiestCategory: await this.getBusiestCategory(),
      slowestCategory: await this.getSlowestCategory(),
    };
  }

  // Get busiest category
  async getBusiestCategory() {
    const result = await Complaint.aggregate([
      { $match: { deletedAt: null } },
      { $group: { _id: "$category", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 1 },
    ]);

    return result.length > 0 ? result[0]._id : null;
  }

  // Get slowest category (highest avg resolution time)
  async getSlowestCategory() {
    const result = await Complaint.aggregate([
      {
        $match: {
          status: "resolved",
          deletedAt: null,
        },
      },
      {
        $project: {
          category: 1,
          resolutionTime: {
            $divide: [
              { $subtract: ["$resolvedAt", "$createdAt"] },
              1000 * 60 * 60 * 24, // Convert to days
            ],
          },
        },
      },
      {
        $group: {
          _id: "$category",
          avgResolutionTime: { $avg: "$resolutionTime" },
        },
      },
      { $sort: { avgResolutionTime: -1 } },
      { $limit: 1 },
    ]);

    return result.length > 0 ? result[0]._id : null;
  }
}

module.exports = AnalyticsService;
