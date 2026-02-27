const express = require("express");
const cors = require("cors");
const path = require("path");
const http = require("http");
const socketIo = require("socket.io");
const complaintRoutes = require("./routes/complaintRoutes");
const authRoutes = require("./routes/authRoutes");
const studentRoutes = require("./routes/studentRoutes");
const adminRoutes = require("./routes/adminRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const analyticsRoutes = require("./routes/analyticsRoutes");
const featureToggleRoutes = require("./routes/featureToggleRoutes");
require("dotenv").config();

const connectDB = require("./config/db");
const FeatureToggle = require("./models/FeatureToggle");

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:3000', 'http://127.0.0.1:5173'],
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Store active users and rooms
const userSockets = new Map();

// Socket.io connection handler
io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("joinUser", (userId) => {
    userSockets.set(userId, socket.id);
    socket.join(`user:${userId}`);
  });

  socket.on("joinAdmin", (adminId) => {
    socket.join("admin");
  });

  socket.on("newComplaint", (data) => {
    io.to("admin").emit("complaintCreated", data);
  });

  socket.on("complaintUpdated", (data) => {
    io.to(`user:${data.studentId}`).emit("complaintStatusChanged", data);
  });

  socket.on("disconnect", () => {
    for (const [userId, socketId] of userSockets.entries()) {
      if (socketId === socket.id) {
        userSockets.delete(userId);
        break;
      }
    }
    console.log("User disconnected:", socket.id);
  });
});

// Attach io to app for use in controllers
app.io = io;

// middleware
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:3000', 'http://127.0.0.1:5173'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Serve uploaded files as static
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// database
const seedFeatureToggles = async () => {
  try {
    const defaults = [
      { key: "duplicate_detection", name: "Smart Duplicate Detection", description: "Warn when similar complaint exists", enabled: true },
      { key: "cost_estimation", name: "Cost Estimation & Budget", description: "Track estimated/actual cost per complaint", enabled: true },
      { key: "version_history", name: "Version History", description: "View complaint change history", enabled: true },
      { key: "soft_delete", name: "Soft Delete & Restore", description: "Restore deleted complaints", enabled: true },
      { key: "high_priority_alerts", name: "High-Priority Alerts", description: "Real-time alerts for high-priority complaints", enabled: true },
      { key: "approval_workflow", name: "Approval Workflow", description: "Multi-level approval for complaints", enabled: true },
    ];
    for (const t of defaults) {
      await FeatureToggle.findOneAndUpdate(
        { key: t.key },
        { $setOnInsert: { ...t, updatedAt: new Date() } },
        { upsert: true, new: true }
      );
    }
  } catch (e) {
    // ignore seed errors
  }
};

// ------------------------
// ROUTES
// ------------------------
// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({ 
    status: "OK", 
    message: "Server is running",
    timestamp: new Date().toISOString()
  });
});

app.use("/api/auth", authRoutes);

// Role-based routes
app.use("/api/student", studentRoutes);
app.use("/api/admin", adminRoutes);

// Legacy routes (for backward compatibility)
app.use("/api/complaints", complaintRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/feature-toggles", featureToggleRoutes);

// 404 Not Found handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "API endpoint not found",
    path: req.path,
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal server error",
    error: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  });
});

const PORT = process.env.PORT || 5000;

// Start server only after DB is connected (avoids requests failing before DB is ready)
connectDB()
  .then(seedFeatureToggles)
  .then(() => {
    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Socket.io server initialized`);
    });
  })
  .catch((err) => {
    console.error("Server failed to start:", err.message);
    process.exit(1);
  });
