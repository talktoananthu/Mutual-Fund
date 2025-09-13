
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
const client = new MongoClient(process.env.MONGO_URI,{ tls: true });
await client.connect();
const db = client.db("MutualFund"); // Database name

app.locals.db = db; // is just an object provided by Express to store data that you want available throughout

// creating collections if not exists
const collections = ["Users", "Portfolio", "Funds", "fund_latest_nav", "fund_nav_history"];
for (const col of collections) {
  const exists = await db.listCollections({ name: col }).hasNext();
  if (!exists) await db.createCollection(col);
}

console.log("MongoDB connected and collections ready");
app.use(express.json());
app.use(cors());

// Routes
app.use("/api/auth", authRoutes);//completed
app.use("/api/portfolio", portfolioRoutes);//completed
app.use("/api/funds", fundRoutes);//completed
startNavUpdateJob(db);
const PORT =  5000;
const startServer = async () => {
  // MongoDB connection code here
  app.listen(PORT, () => console.log(` Server running on http://localhost:${PORT}`));
};

startServer();