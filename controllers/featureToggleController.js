const FeatureToggle = require("../models/FeatureToggle");

// Get all feature toggles (admin only for editing; students can read for UI)
const getToggles = async (req, res) => {
  try {
    const toggles = await FeatureToggle.find().sort({ key: 1 }).lean();
    res.status(200).json({ success: true, toggles });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get single toggle by key (public for frontend feature flags)
const getToggleByKey = async (req, res) => {
  try {
    const toggle = await FeatureToggle.findOne({ key: req.params.key }).lean();
    if (!toggle) {
      return res.status(404).json({ success: false, message: "Feature not found" });
    }
    res.status(200).json({ success: true, enabled: toggle.enabled, toggle });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Update toggle (admin only)
const updateToggle = async (req, res) => {
  try {
    const { enabled } = req.body;
    const toggle = await FeatureToggle.findOneAndUpdate(
      { key: req.params.key },
      { enabled: enabled !== undefined ? !!enabled : true, updatedAt: new Date() },
      { new: true }
    );
    if (!toggle) {
      return res.status(404).json({ success: false, message: "Feature not found" });
    }
    res.status(200).json({ success: true, toggle });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getToggles,
  getToggleByKey,
  updateToggle,
};
