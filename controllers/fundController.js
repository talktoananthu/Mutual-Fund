import { getAllFunds, getNAVHistory, getLatestNAV } from "../services/mutualFundService.js";
import axios from "axios";      // 
import cron from "node-cron";
export const listFunds = async (req, res) => {
  try {
    const db = req.app.locals.db;

    // --- Query parameters (optional) ---
    const search = req.query.search || "";
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    // --- Build MongoDB filter ---
    const filter = {};
    if (search) {
      filter.$or = [
        { schemeName: { $regex: search, $options: "i" } },
        { fundHouse: { $regex: search, $options: "i" } },
        { schemeType: { $regex: search, $options: "i" } },
        { schemeCategory: { $regex: search, $options: "i" } },
      ];
    }

    // --- Get total count for pagination ---
    const totalFunds = await db.collection("Funds").countDocuments(filter);
    const totalPages = Math.ceil(totalFunds / limit);

    // --- Fetch funds from DB ---
    const funds = await db
      .collection("Funds")
      .find(filter)
      .project({ _id: 0, schemeCode: 1, schemeName: 1, fundHouse: 1, schemeType: 1, schemeCategory: 1 })
      .skip(skip)
      .limit(limit)
      .toArray();

    // ---  tip message ---
    const tip = !req.query.search && !req.query.page && !req.query.limit
      ? "Tip: You can pass optional query parameters like ?search=bluechip&page=1&limit=20"
      : null;

    // --- Send response ---
    res.json({
      success: true,
      tip, // will be null if query params are provided
      data: {
        funds,
        pagination: {
          currentPage: page,
          totalPages,
          totalFunds,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const fundHistory = async (req, res) => {
  try {
    const { schemeCode } = req.body;
   if (!schemeCode) {
  return res.status(400).json({ 
    success: false,
    message: 'schemeCode is required. Pass it in the body like this: {"schemeCode": 100150}' 
  });
}

    const navResponse = await getNAVHistory(schemeCode);
    const historyData = navResponse.data; // the array

    if (!historyData || !Array.isArray(historyData)) {
      return res.status(404).json({ success: false, message: "No NAV history found" });
    }

    const latest = historyData[0];
    const last30Days = historyData.slice(0, 30);

    const db = req.app.locals.db;
    const fund = await db.collection("Funds").findOne({ schemeCode: Number(schemeCode) });

    if (!fund) {
      return res.status(404).json({ success: false, message: "Fund not found in DB" });
    }

    res.json({
      success: true,
      data: {
        schemeCode: fund.schemeCode,
        schemeName: fund.schemeName,
        currentNav: parseFloat(latest.nav),
        asOn: latest.date,
        history: last30Days.map(h => ({ date: h.date, nav: parseFloat(h.nav) }))
      }
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};



// Utility functions
async function fetchLatestNAV(schemeCode) {
  const response = await axios.get(`https://api.mfapi.in/mf/${schemeCode}`);
  const history = response.data.data;
  if (!history || history.length === 0) return null;

  const latest = history[0]; // first entry = latest NAV
  return {
    schemeCode,
    nav: parseFloat(latest.nav),
    date: new Date(latest.date)
  };
}

async function updateLatestNAV(db, schemeCode, latestNav) {
  if (!latestNav) return;

  await db.collection("fund_latest_nav").updateOne(
    { schemeCode },
    { $set: latestNav },
    { upsert: true }
  );
}

async function addNAVHistory(db, schemeCode, latestNav) {
  if (!latestNav) return;

  await db.collection("fund_nav_history").updateOne(
    { schemeCode, date: latestNav.date },
    { $set: latestNav },
    { upsert: true }
  );
}

export function startNavUpdateJob(db) {

  // Run every day at 12:00 AM IST
  cron.schedule("0 0 * * *", async () => {
    console.log("Starting daily NAV update...");

    try {
      //  Get all unique scheme codes from Portfolio collection
      const portfolioSchemes = await db.collection("Portfolio").distinct("schemeCode");

      //  Fetch and update NAV for each scheme
      for (const schemeCode of portfolioSchemes) {
        const latestNav = await fetchLatestNAV(schemeCode);

        if (latestNav) {
          await updateLatestNAV(db, schemeCode, latestNav);
          await addNAVHistory(db, schemeCode, latestNav);
          console.log(`Updated NAV for scheme ${schemeCode}`);
        }
      }

      console.log("Daily NAV update completed.");
    } catch (err) {
      console.error("NAV update failed:", err.message);
    }
  }, {
    timezone: "Asia/Kolkata" // ensure IST
  });
}
