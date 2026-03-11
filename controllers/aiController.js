const AISuggestionService = require("../services/aiSuggestionService");
const Complaint = require("../models/Complaint");
const User = require("../models/User");

const aiService = new AISuggestionService();

// Analyze complaint and get suggestions
exports.analyzeComplaint = async (req, res) => {
  try {
    const { title, description, category } = req.body;

    if (!title || !description || !category) {
      return res.status(400).json({
        success: false,
        message: "Title, description, and category are required",
      });
    }

    const analysis = await aiService.analyzeComplaint(title, description, category);

    res.json({
      success: true,
      analysis,
    });
  } catch (error) {
    console.error("Error analyzing complaint:", error);
    res.status(500).json({
      success: false,
      message: "Error analyzing complaint",
    });
  }
};

// Get AI suggestions for existing complaint
exports.getComplaintSuggestions = async (req, res) => {
  try {
    const { complaintId } = req.params;

    const complaint = await Complaint.findById(complaintId);
    if (!complaint) {
      return res.status(404).json({
        success: false,
        message: "Complaint not found",
      });
    }

    const analysis = await aiService.analyzeComplaint(
      complaint.title,
      complaint.description,
      complaint.category
    );

    res.json({
      success: true,
      complaint: {
        id: complaint._id,
        title: complaint.title,
        category: complaint.category,
      },
      suggestions: analysis,
    });
  } catch (error) {
    console.error("Error getting complaint suggestions:", error);
    res.status(500).json({
      success: false,
      message: "Error getting suggestions",
    });
  }
};

// Auto-assign complaint
exports.autoAssignComplaint = async (req, res) => {
  try {
    const { complaintId } = req.params;

    const result = await aiService.autoAssign(complaintId);

    if (!result) {
      return res.status(404).json({
        success: false,
        message: "Complaint not found",
      });
    }

    if (result.assigned) {
      res.json({
        success: true,
        assigned: true,
        assignee: result.assignee,
        message: `Complaint auto-assigned to ${result.assignee.name}`,
      });
    } else {
      res.json({
        success: true,
        assigned: false,
        reason: result.reason,
        message: "Could not auto-assign complaint",
      });
    }
  } catch (error) {
    console.error("Error auto-assigning complaint:", error);
    res.status(500).json({
      success: false,
      message: "Error auto-assigning complaint",
    });
  }
};

// Get trending issues
exports.getTrendingIssues = async (req, res) => {
  try {
    const trending = await aiService.getTrendingIssues();

    res.json({
      success: true,
      trending,
    });
  } catch (error) {
    console.error("Error getting trending issues:", error);
    res.status(500).json({
      success: false,
      message: "Error getting trending issues",
    });
  }
};

// Predict resolution time
exports.predictResolutionTime = async (req, res) => {
  try {
    const { category, priority } = req.query;

    if (!category || !priority) {
      return res.status(400).json({
        success: false,
        message: "Category and priority are required",
      });
    }

    const prediction = await aiService.predictResolutionTime(category, priority);

    res.json({
      success: true,
      prediction,
    });
  } catch (error) {
    console.error("Error predicting resolution time:", error);
    res.status(500).json({
      success: false,
      message: "Error predicting resolution time",
    });
  }
};

// Get smart duplicate detection
exports.checkDuplicates = async (req, res) => {
  try {
    const { title, description, category } = req.body;

    if (!title || !category) {
      return res.status(400).json({
        success: false,
        message: "Title and category are required",
      });
    }

    // Use the static method on Complaint model
    const duplicates = await Complaint.findSimilar(
      title,
      description || "",
      category,
      req.user._id,
      7 // Check last 7 days
    );

    // Calculate similarity scores
    const scoredDuplicates = duplicates.map(complaint => {
      const titleWords = title.toLowerCase().split(/\s+/);
      const complaintTitleWords = complaint.title.toLowerCase().split(/\s+/);
      const commonWords = titleWords.filter(w => complaintTitleWords.includes(w));
      const similarity = commonWords.length / Math.max(titleWords.length, complaintTitleWords.length);

      return {
        ...complaint.toObject(),
        similarityScore: Math.round(similarity * 100),
      };
    });

    // Filter high similarity (above 50%)
    const highSimilarity = scoredDuplicates.filter(d => d.similarityScore >= 50);

    res.json({
      success: true,
      hasDuplicates: highSimilarity.length > 0,
      duplicates: scoredDuplicates,
      highSimilarity,
    });
  } catch (error) {
    console.error("Error checking duplicates:", error);
    res.status(500).json({
      success: false,
      message: "Error checking for duplicates",
    });
  }
};

// Get category suggestions based on description
exports.suggestCategory = async (req, res) => {
  try {
    const { description } = req.body;

    if (!description) {
      return res.status(400).json({
        success: false,
        message: "Description is required",
      });
    }

    const text = description.toLowerCase();
    const categories = {
      cleaning: ["clean", "dirty", "hygiene", "sanitize", "dust", "garbage", "mess"],
      maintenance: ["repair", "broken", "fix", "damage", "maintenance"],
      food: ["food", "meal", "mess", "canteen", "catering", "taste"],
      water: ["water", "leak", "tap", "supply", "pressure", "pipe"],
      electricity: ["power", "electricity", "light", "fan", "outage", "fuse"],
      plumbing: ["toilet", "bathroom", "shower", "sink", "clogged", "flush"],
      furniture: ["bed", "chair", "table", "desk", "cupboard", "mattress"],
      internet: ["wifi", "internet", "network", "connection", "slow"],
      security: ["security", "safety", "lock", "door", "theft"],
    };

    const scores = {};
    for (const [category, keywords] of Object.entries(categories)) {
      const matches = keywords.filter(kw => text.includes(kw));
      scores[category] = matches.length;
    }

    // Sort by score
    const sortedCategories = Object.entries(scores)
      .sort((a, b) => b[1] - a[1])
      .filter(([_, score]) => score > 0)
      .map(([category, score]) => ({
        category,
        confidence: Math.min(score * 20, 100),
      }));

    res.json({
      success: true,
      suggestions: sortedCategories.slice(0, 3),
      topSuggestion: sortedCategories[0] || null,
    });
  } catch (error) {
    console.error("Error suggesting category:", error);
    res.status(500).json({
      success: false,
      message: "Error suggesting category",
    });
  }
};
