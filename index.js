import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import { MongoClient } from "mongodb";
import authRoutes from "./routes/authRoutes.js";
import portfolioRoutes from "./routes/investmentRoutes.js";
import fundRoutes from "./routes/fundRoutes.js";
import { startNavUpdateJob } from "./controllers/fundController.js";

dotenv.config();
const app = express();

// MongoDB connection options
const client = new MongoClient(process.env.MONGO_URI, {
  tls: true,                       // enforce TLS
  serverSelectionTimeoutMS: 10000, // fail fast if can't connect
  connectTimeoutMS: 10000,
  retryWrites: true
});

try {
  await client.connect();
  const db = client.db("MutualFund"); // Database name
  app.locals.db = db;

  // Create collections if not exist
  const collections = ["Users", "Portfolio", "Funds", "fund_latest_nav", "fund_nav_history"];
  for (const col of collections) {
    const exists = await db.listCollections({ name: col }).hasNext();
    if (!exists) await db.createCollection(col);
  }

  console.log("MongoDB connected and collections ready");

  // Middleware
  app.use(express.json());
  app.use(cors());

  // Routes
  app.use("/api/auth", authRoutes);
  app.use("/api/portfolio", portfolioRoutes);
  app.use("/api/funds", fundRoutes);

  // Cron jobs
  startNavUpdateJob(db);

  // Start server
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

} catch (err) {
  console.error("MongoDB connection failed:", err);
  process.exit(1);
}