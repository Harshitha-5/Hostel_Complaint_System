const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
  },
  password: {
    type: String,
    required: true,
  },
  role: {
    type: String,
    enum: ["student", "admin", "warden", "superadmin"],
    default: "student",
  },
  roomNo: {
    type: String,
    default: "",
  },
  hostel: {
    type: String,
    default: "",
  },
  
  // Contact information
  phone: {
    type: String,
    default: "",
  },
  
  // Profile
  avatar: {
    type: String, // URL to avatar image
    default: "",
  },
  
  // Notification preferences
  notificationPreferences: {
    email: { type: Boolean, default: true },
    push: { type: Boolean, default: true },
    inApp: { type: Boolean, default: true },
    complaintUpdates: { type: Boolean, default: true },
    mentions: { type: Boolean, default: true },
    escalations: { type: Boolean, default: true },
    weeklyDigest: { type: Boolean, default: true },
  },
  
  // For wardens/admins - assigned hostel blocks
  assignedBlocks: [{
    type: String,
  }],
  
  // For wardens/admins - areas of responsibility
  responsibilityAreas: [{
    type: String,
    enum: ["cleaning", "maintenance", "food", "water", "electricity", "electrical", "plumbing", "furniture", "internet", "security", "other"],
  }],
  
  // Account status
  isActive: {
    type: Boolean,
    default: true,
  },
  
  // Last login
  lastLogin: {
    type: Date,
    default: null,
  },
  
  // Login history (last 10)
  loginHistory: [{
    timestamp: { type: Date, default: Date.now },
    ipAddress: String,
    userAgent: String,
  }],
  
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Hash password before saving (async – no next, Mongoose waits for the Promise)
userSchema.pre("save", async function () {
  if (!this.isModified("password")) return;

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Update timestamp on save
userSchema.pre("save", function () {
  this.updatedAt = new Date();
});

// Method to compare passwords
userSchema.methods.comparePassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model("User", userSchema);
