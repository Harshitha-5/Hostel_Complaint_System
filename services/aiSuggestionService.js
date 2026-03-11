const Complaint = require("../models/Complaint");
const User = require("../models/User");

class AISuggestionService {
  // Knowledge base of common issues and solutions
  constructor() {
    this.solutionDatabase = {
      cleaning: {
        keywords: ["dirty", "clean", "mess", "hygiene", "sanitize", "dust", "garbage", "trash"],
        solutions: [
          "Schedule immediate cleaning with housekeeping staff",
          "Provide cleaning supplies to student for immediate use",
          "Arrange deep cleaning service within 24 hours",
          "Inspect and clean common areas in the vicinity",
        ],
        estimatedDays: 1,
        assignTo: "housekeeping",
      },
      maintenance: {
        keywords: ["repair", "broken", "fix", "damaged", "maintenance", "service"],
        solutions: [
          "Dispatch maintenance team for assessment",
          "Schedule repair based on severity assessment",
          "Provide temporary workaround if applicable",
          "Order replacement parts if needed",
        ],
        estimatedDays: 2,
        assignTo: "maintenance",
      },
      food: {
        keywords: ["food", "meal", "mess", "canteen", "catering", "quality", "taste", "hygiene"],
        solutions: [
          "Review food quality with catering supervisor",
          "Inspect kitchen and storage areas",
          "Coordinate with mess committee for resolution",
          "Provide alternative meal arrangement if necessary",
        ],
        estimatedDays: 1,
        assignTo: "mess",
      },
      water: {
        keywords: ["water", "leak", "tap", "supply", "pressure", "pipe", "drainage"],
        solutions: [
          "Check main water supply and pressure",
          "Inspect plumbing for leaks or blockages",
          "Coordinate with plumber for immediate repair",
          "Provide temporary water arrangement if needed",
        ],
        estimatedDays: 1,
        assignTo: "plumbing",
      },
      electricity: {
        keywords: ["power", "electricity", "light", "fan", "outage", "fuse", "wiring"],
        solutions: [
          "Check electrical panel and circuit breakers",
          "Inspect wiring and connections",
          "Replace faulty switches or fixtures",
          "Coordinate with electrician for complex issues",
        ],
        estimatedDays: 1,
        assignTo: "electrical",
      },
      electrical: {
        keywords: ["appliance", "device", "equipment", "AC", "cooler", "heater"],
        solutions: [
          "Test appliance functionality",
          "Check power supply to device",
          "Arrange repair or replacement",
          "Provide temporary alternative if available",
        ],
        estimatedDays: 2,
        assignTo: "electrical",
      },
      plumbing: {
        keywords: ["toilet", "bathroom", "shower", "sink", "clogged", "flush"],
        solutions: [
          "Inspect plumbing fixtures and pipes",
          "Clear blockages using appropriate tools",
          "Repair or replace damaged fixtures",
          "Sanitize area after repair",
        ],
        estimatedDays: 1,
        assignTo: "plumbing",
      },
      furniture: {
        keywords: ["bed", "chair", "table", "desk", "cupboard", "mattress", "broken"],
        solutions: [
          "Assess damage and repair feasibility",
          "Arrange carpentry work if repairable",
          "Order replacement if beyond repair",
          "Provide temporary furniture if available",
        ],
        estimatedDays: 3,
        assignTo: "maintenance",
      },
      internet: {
        keywords: ["wifi", "internet", "network", "connection", "slow", "speed", "router"],
        solutions: [
          "Check router and network equipment status",
          "Test connection speed and stability",
          "Reset network devices if needed",
          "Coordinate with ISP for external issues",
        ],
        estimatedDays: 1,
        assignTo: "it",
      },
      security: {
        keywords: ["security", "safety", "lock", "door", "theft", "unauthorized", "stranger"],
        solutions: [
          "Review security footage if available",
          "Inspect locks and access points",
          "Coordinate with security personnel",
          "Implement additional security measures if needed",
        ],
        estimatedDays: 1,
        assignTo: "security",
      },
    };

    this.priorityIndicators = {
      critical: ["urgent", "emergency", "dangerous", "unsafe", "hazard", "fire", "flood", "injury", "medical"],
      high: ["broken", "not working", "severe", "major", "important", "leak", "power outage"],
      low: ["minor", "cosmetic", "suggestion", "improvement", "enhancement"],
    };
  }

  // Analyze complaint and suggest solutions
  async analyzeComplaint(title, description, category) {
    const text = `${title} ${description}`.toLowerCase();
    
    // Determine priority
    const suggestedPriority = this.suggestPriority(text);
    
    // Find best matching solution
    const solution = this.suggestSolution(text, category);
    
    // Find similar past complaints
    const similarComplaints = await this.findSimilarComplaints(title, description, category);
    
    // Suggest assignee
    const suggestedAssignee = await this.suggestAssignee(category, text);
    
    // Calculate confidence score
    const confidence = this.calculateConfidence(text, category, similarComplaints.length);

    return {
      suggestedPriority,
      suggestedSolution: solution.text,
      estimatedDays: solution.estimatedDays,
      suggestedAssignee,
      similarComplaints: similarComplaints.slice(0, 3),
      confidence,
      categoryMatch: solution.categoryMatch,
      keywords: solution.matchedKeywords,
    };
  }

  // Suggest priority based on text analysis
  suggestPriority(text) {
    for (const keyword of this.priorityIndicators.critical) {
      if (text.includes(keyword)) return "critical";
    }
    for (const keyword of this.priorityIndicators.high) {
      if (text.includes(keyword)) return "high";
    }
    for (const keyword of this.priorityIndicators.low) {
      if (text.includes(keyword)) return "low";
    }
    return "medium";
  }

  // Suggest solution based on category and keywords
  suggestSolution(text, category) {
    const categoryData = this.solutionDatabase[category];
    
    if (!categoryData) {
      return {
        text: "Review complaint and assign to appropriate department",
        estimatedDays: 2,
        categoryMatch: 0.5,
        matchedKeywords: [],
      };
    }

    // Find matched keywords
    const matchedKeywords = categoryData.keywords.filter(kw => text.includes(kw));
    const keywordMatch = matchedKeywords.length / categoryData.keywords.length;

    // Select appropriate solution based on keyword match
    let solutionIndex = 0;
    if (keywordMatch > 0.5) solutionIndex = 1;
    if (keywordMatch > 0.7) solutionIndex = 2;
    if (keywordMatch > 0.9) solutionIndex = 3;

    return {
      text: categoryData.solutions[Math.min(solutionIndex, categoryData.solutions.length - 1)],
      estimatedDays: categoryData.estimatedDays,
      categoryMatch: 0.7 + (keywordMatch * 0.3),
      matchedKeywords,
    };
  }

  // Find similar past complaints
  async findSimilarComplaints(title, description, category) {
    const keywords = this.extractKeywords(`${title} ${description}`);
    
    return await Complaint.find({
      category,
      status: "resolved",
      deletedAt: null,
      $or: [
        { title: { $regex: keywords.join("|"), $options: "i" } },
        { description: { $regex: keywords.join("|"), $options: "i" } },
      ],
    })
      .select("title description resolutionFeedback resolutionRating")
      .sort({ resolvedAt: -1 })
      .limit(5);
  }

  // Suggest assignee based on category and workload
  async suggestAssignee(category, text) {
    const categoryToResponsibility = {
      cleaning: "cleaning",
      maintenance: "maintenance",
      food: "food",
      water: "water",
      electricity: "electricity",
      electrical: "electrical",
      plumbing: "plumbing",
      furniture: "furniture",
      internet: "internet",
      security: "security",
    };

    const responsibility = categoryToResponsibility[category];
    if (!responsibility) return null;

    // Find staff with this responsibility and lowest active workload
    const potentialAssignees = await User.find({
      role: { $in: ["admin", "warden"] },
      isActive: true,
      responsibilityAreas: responsibility,
    });

    if (potentialAssignees.length === 0) return null;

    // Get workload for each potential assignee
    const assigneesWithWorkload = await Promise.all(
      potentialAssignees.map(async (user) => {
        const activeCount = await Complaint.countDocuments({
          assignedTo: user._id,
          status: { $in: ["pending", "in_progress"] },
          deletedAt: null,
        });

        return {
          userId: user._id,
          name: user.name,
          role: user.role,
          activeComplaints: activeCount,
        };
      })
    );

    // Sort by workload (ascending)
    assigneesWithWorkload.sort((a, b) => a.activeComplaints - b.activeComplaints);

    return assigneesWithWorkload[0];
  }

  // Calculate confidence score
  calculateConfidence(text, category, similarCount) {
    let score = 0.5; // Base score

    // Increase if category is recognized
    if (this.solutionDatabase[category]) score += 0.2;

    // Increase based on similar complaints found
    if (similarCount > 0) score += Math.min(similarCount * 0.1, 0.2);

    // Increase if clear keywords found
    const allKeywords = Object.values(this.solutionDatabase).flatMap(d => d.keywords);
    const matchedKeywords = allKeywords.filter(kw => text.includes(kw));
    score += Math.min(matchedKeywords.length * 0.05, 0.1);

    return Math.min(Math.round(score * 100), 100);
  }

  // Extract keywords from text
  extractKeywords(text) {
    const stopWords = ["the", "a", "an", "is", "are", "was", "were", "be", "been", "have", "has", "had", "do", "does", "did", "will", "would", "could", "should", "may", "might", "must", "shall", "can", "need", "dare", "ought", "used", "to", "of", "in", "for", "on", "with", "at", "by", "from", "as", "into", "through", "during", "before", "after", "above", "below", "between", "under", "and", "but", "or", "yet", "so", "if", "because", "although", "though", "while", "where", "when", "that", "which", "who", "whom", "whose", "what", "this", "these", "those", "i", "me", "my", "myself", "we", "our", "ours", "ourselves", "you", "your", "yours", "yourself", "yourselves", "he", "him", "his", "himself", "she", "her", "hers", "herself", "it", "its", "itself", "they", "them", "their", "theirs", "themselves"];
    
    return text
      .toLowerCase()
      .replace(/[^a-zA-Z\s]/g, "")
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.includes(word))
      .slice(0, 10);
  }

  // Auto-assign complaint to best staff member
  async autoAssign(complaintId) {
    const complaint = await Complaint.findById(complaintId);
    if (!complaint) return null;

    const text = `${complaint.title} ${complaint.description}`.toLowerCase();
    const suggestedAssignee = await this.suggestAssignee(complaint.category, text);

    if (suggestedAssignee) {
      complaint.assignedTo = suggestedAssignee.userId;
      complaint.assignedAt = new Date();
      await complaint.save();

      return {
        assigned: true,
        assignee: suggestedAssignee,
      };
    }

    return {
      assigned: false,
      reason: "No suitable assignee found",
    };
  }

  // Get trending issues (frequent complaints in last 7 days)
  async getTrendingIssues() {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    return await Complaint.aggregate([
      {
        $match: {
          createdAt: { $gte: weekAgo },
          deletedAt: null,
        },
      },
      {
        $group: {
          _id: "$category",
          count: { $sum: 1 },
          complaints: { $push: { title: "$title", _id: "$_id" } },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 5 },
    ]);
  }

  // Predict resolution time based on historical data
  async predictResolutionTime(category, priority) {
    const resolvedComplaints = await Complaint.find({
      category,
      priority,
      status: "resolved",
      deletedAt: null,
    }).select("createdAt resolvedAt");

    if (resolvedComplaints.length === 0) {
      return {
        predictedDays: priority === "critical" ? 1 : priority === "high" ? 2 : 3,
        confidence: "low",
        sampleSize: 0,
      };
    }

    const resolutionTimes = resolvedComplaints.map(c => {
      return (new Date(c.resolvedAt) - new Date(c.createdAt)) / (1000 * 60 * 60 * 24);
    });

    const avgTime = resolutionTimes.reduce((a, b) => a + b, 0) / resolutionTimes.length;
    const predictedDays = Math.ceil(avgTime);

    return {
      predictedDays,
      confidence: resolvedComplaints.length > 10 ? "high" : resolvedComplaints.length > 5 ? "medium" : "low",
      sampleSize: resolvedComplaints.length,
      averageDays: Math.round(avgTime * 10) / 10,
    };
  }
}

module.exports = AISuggestionService;
