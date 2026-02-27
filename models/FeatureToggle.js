const mongoose = require("mongoose");

const featureToggleSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true,
  },
  name: { type: String, required: true },
  description: { type: String, default: "" },
  enabled: { type: Boolean, default: true },
  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("FeatureToggle", featureToggleSchema);
