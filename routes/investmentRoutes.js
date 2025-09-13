import express from "express";
import { addFund, listPortfolio, portfolioValue, removeFund,portfolioHistory } from "../controllers/portfolioController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import {RateLimiterApi} from "../middleware/rateLimiter.js"
const router = express.Router();
console.log('hi')
router.post("/add", authMiddleware,RateLimiterApi, addFund);//added completed
router.get("/list", authMiddleware,RateLimiterApi, listPortfolio); //completed
router.get("/value", authMiddleware,RateLimiterApi, portfolioValue);//completed
router.get("/history", authMiddleware,RateLimiterApi,portfolioHistory); //completed
router.delete("/remove", authMiddleware,RateLimiterApi, removeFund);//completed

export default router;