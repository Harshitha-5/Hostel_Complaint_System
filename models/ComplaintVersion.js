const mongoose = require("mongoose");

const complaintVersionSchema = new mongoose.Schema({
  complaintId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Complaint",
    required: true,
  },
  version: { type: Number, required: true },
  snapshot: {
    status: String,
    adminNotes: String,
    estimatedCost: Number,
    actualCost: Number,
    approvalStatus: String,
  },
  changedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  changeReason: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("ComplaintVersion", complaintVersionSchema);
