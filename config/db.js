const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    if (!process.env.MONGO_URI) {
      console.error("MONGO_URI is not defined in .env file");
      console.error("Create a .env file in the backend directory with MONGO_URI (e.g. MongoDB Atlas connection string), PORT, and JWT_SECRET.");
      process.exit(1);
    }

    await mongoose.connect(process.env.MONGO_URI);
    console.log("MongoDB connected successfully");
  } catch (error) {
    console.error("MongoDB connection error:", error.message);
    console.error("If using Atlas: check connection string, IP whitelist, and credentials.");
    process.exit(1);
  }
};

module.exports = connectDB;



