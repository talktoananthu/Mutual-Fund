import express from "express";
import { listFunds, fundHistory } from "../controllers/fundController.js";
import {RateLimiterApi} from "../middleware/rateLimiter.js"
const router = express.Router();

router.get("/", RateLimiterApi,listFunds);//completed
router.get("/nav", RateLimiterApi,fundHistory);//completed


export default router;