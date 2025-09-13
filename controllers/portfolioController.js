import { getLatestNAV,getNAVHistory  } from "../services/mutualFundService.js";
import axios from "axios";
import { ObjectId } from "mongodb";

// memory for portfolio storage
let portfolios = []
export const addFund = async (req, res) => {
  const { schemeCode, units, purchaseDate } = req.body;
  const db = req.app.locals.db;

   // --- Check schemeCode ---
  if (!schemeCode || isNaN(schemeCode) || Number(schemeCode) <= 0) {
    return res.status(400).json({
      success: false,
      message: "Invalid schemeCode. Please enter a positive number."
    });
  }

  // --- Check units ---
  if (!units || isNaN(units) || Number(units) <= 0) {
    return res.status(400).json({
      success: false,
      message: "Invalid units. Please enter a positive number."
    });
  }

  // If both are valid
  

  // --- Ensure fund exists in Funds collection ---
  let fund = await db.collection("Funds").findOne({ schemeCode: Number(schemeCode) });

  if (!fund) {
    try {
      const response = await axios.get(`https://api.mfapi.in/mf/${schemeCode}`);
      const data = response.data;
      fund = {
        schemeCode: Number(schemeCode),
        schemeName: data.meta.scheme_name,
        isinGrowth: data.meta.isin_growth || null,
        isinDivReinvestment: data.meta.isin_div_reinvestment || null,
        fundHouse: data.meta.fund_house || null,
        schemeType: data.meta.scheme_type || null,
        schemeCategory: data.meta.scheme_category || null
      };
      await db.collection("Funds").insertOne(fund);
    } catch (err) {
      return res.status(404).json({ success: false, message: "Fund not found in MFAPI" });
    }
  }

  // --- Fetch NAV history to determine purchase NAV ---
  let purchaseNav = null;
  try {
    const historyRes = await axios.get(`https://api.mfapi.in/mf/${schemeCode}`);
    const history = historyRes.data.data;

    const dateToCheck = purchaseDate ? new Date(purchaseDate) : new Date();

    const purchaseEntry = history.find(entry => new Date(entry.date) <= dateToCheck);
    purchaseNav = purchaseEntry ? parseFloat(purchaseEntry.nav) : null;
  } catch (err) {
    console.error("Error fetching NAV history:", err.message);
  }

  if (!purchaseNav) {
    return res.status(400).json({
      success: false,
      message: "Could not determine purchase NAV"
    });
  }

  // --- Create Portfolio entry ---
  const portfolioEntry = {
    userId: new ObjectId(req.user.id),
    schemeCode: Number(schemeCode),
    schemeName: fund.schemeName,
    units,
    purchaseDate: purchaseDate ? new Date(purchaseDate) : new Date(),
    purchaseNav,
    createdAt: new Date()
  };

  await db.collection("Portfolio").insertOne(portfolioEntry);

  res.json({
    success: true,
    message: "Fund added to portfolio successfully",
    portfolio: portfolioEntry
  });
};


export const listPortfolio = async (req, res) => {
  try {
    const db = req.app.locals.db;
    const userId = new ObjectId(req.user.id);

    const holdings = await db.collection("Portfolio").find({ userId }).toArray();

    if (!holdings.length) {
      return res.json({ success: true, data: { totalHoldings: 0, holdings: [] } });
    }

    const result = [];

    for (const h of holdings) {
      try {
        const navData = await getLatestNAV(h.schemeCode);

        // Get latest NAV from navData.data array
        let currentNav = null;
        if (navData && navData.data && navData.data.length) {
          currentNav = parseFloat(navData.data[0].nav); // latest NAV
        }

        console.log(`SchemeCode: ${h.schemeCode}, SchemeName: ${h.schemeName}, Current NAV: ${currentNav}`);

        result.push({
          schemeCode: h.schemeCode,
          schemeName: h.schemeName,
          units: h.units,
          currentNav: currentNav,
          currentValue: currentNav ? parseFloat((h.units * currentNav).toFixed(2)) : null
        });

      } catch (err) {
        console.warn(`Failed to fetch NAV for schemeCode ${h.schemeCode}:`, err.message);
        result.push({
          schemeCode: h.schemeCode,
          schemeName: h.schemeName,
          units: h.units,
          currentNav: null,
          currentValue: null
        });
      }
    }

    res.json({
      success: true,
      data: {
        totalHoldings: result.length,
        holdings: result
      }
    });

  } catch (err) {
    console.error("List Portfolio Error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};





export const portfolioValue = async (req, res) => {
  try {
    const db = req.app.locals.db;

    // Get all purchases by this user
    const purchases = await db
      .collection("Portfolio")
      .find({ userId: new ObjectId(req.user.id) })
      .toArray();

    if (!purchases.length) {
      return res.status(404).json({ success: false, message: "No holdings found" });
    }

    let totalInvestment = 0;
    let currentValue = 0;
    let asOn = null;

    // Group by schemeCode
    const grouped = {};

    for (let p of purchases) {
      // get latest NAV
      const latest = await getLatestNAV(p.schemeCode);
      const currentNav = parseFloat(latest.data[0].nav);
      asOn = latest.data[0].date;

      // calculate invested/current/profit for this purchase
      const investedValue = p.units * p.purchaseNav;
      const currVal = p.units * currentNav;
      const profitLoss = currVal - investedValue;

      // if scheme already exists in map, aggregate
      if (!grouped[p.schemeCode]) {
        grouped[p.schemeCode] = {
          schemeCode: p.schemeCode,
          schemeName: p.schemeName,
          units: 0,
          currentNav,
          currentValue: 0,
          investedValue: 0,
          profitLoss: 0
        };
      }

      grouped[p.schemeCode].units += p.units;
      grouped[p.schemeCode].currentValue += currVal;
      grouped[p.schemeCode].investedValue += investedValue;
      grouped[p.schemeCode].profitLoss += profitLoss;
    }

    // prepare final holdings
    const holdings = Object.values(grouped).map(h => {
      totalInvestment += h.investedValue;
      currentValue += h.currentValue;
      return {
        ...h,
        currentValue: parseFloat(h.currentValue.toFixed(2)),
        investedValue: parseFloat(h.investedValue.toFixed(2)),
        profitLoss: parseFloat(h.profitLoss.toFixed(2))
      };
    });

    // totals
    const profitLoss = currentValue - totalInvestment;
    const profitLossPercent = totalInvestment > 0 ? (profitLoss / totalInvestment) * 100 : 0;

    res.json({
      success: true,
      data: {
        totalInvestment: parseFloat(totalInvestment.toFixed(2)),
        currentValue: parseFloat(currentValue.toFixed(2)),
        profitLoss: parseFloat(profitLoss.toFixed(2)),
        profitLossPercent: parseFloat(profitLossPercent.toFixed(3)),
        asOn,
        holdings
      }
    });
  } catch (err) {
    console.error("Portfolio error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

function formatDate(date) {
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
}

// Parse DD-MM-YYYY into JS Date
function parseDDMMYYYY(dateStr) {
  if (!dateStr) return null;
  const [day, month, year] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day); // month is 0-based in JS
}

// Normalize date (strip time, set to midnight)
function normalizeDate(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

// Controller: GET /api/portfolio/history
export const portfolioHistory = async (req, res) => {
  try {
    const db = req.app.locals.db;
    const userId = new ObjectId(req.user.id);

    let { startDate, endDate } = req.query;
    const today = normalizeDate(new Date());

    endDate = endDate ? normalizeDate(parseDDMMYYYY(endDate)) : today;
    startDate = startDate
      ? normalizeDate(parseDDMMYYYY(startDate))
      : new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Step 1: Get all purchases for this user
    const purchases = await db.collection("Portfolio").find({ userId }).toArray();
    if (!purchases.length) {
      return res.status(404).json({ success: false, message: "No purchases found" });
    }

    // Step 2: Ensure startDate is not before first purchase date
    const minPurchaseDate = normalizeDate(
      new Date(Math.min(...purchases.map(p => new Date(p.purchaseDate))))
    );
    const actualStartDate = startDate < minPurchaseDate ? minPurchaseDate : startDate;

    // Step 3: Generate all dates in range
    const dateList = [];
    for (let dt = new Date(actualStartDate); dt <= endDate; dt.setDate(dt.getDate() + 1)) {
      dateList.push(new Date(dt));
    }

    // Step 4: Fetch NAV history once per scheme
    const schemeNavMap = {};
    for (const p of purchases) {
      if (!schemeNavMap[p.schemeCode]) {
        const navHistory = await getNAVHistory(p.schemeCode); // API call once per scheme
        schemeNavMap[p.schemeCode] = navHistory.data.map(entry => ({
          date: normalizeDate(parseDDMMYYYY(entry.date)),
          nav: parseFloat(entry.nav),
        }));
      }
    }

    // Step 5: Loop over each date and calculate totalValue & profitLoss
    const historyData = [];

    for (const date of dateList) {
      let totalValue = 0;
      let totalInvested = 0;

      for (const p of purchases) {
        const purchaseDate = normalizeDate(new Date(p.purchaseDate));
        const currentDate = normalizeDate(date);

        if (purchaseDate.getTime() > currentDate.getTime()) continue; // skip purchases after this date

        const navArray = schemeNavMap[p.schemeCode];

        // Find latest NAV <= currentDate
        const navEntry = navArray
          .slice()
          .reverse()
          .find(entry => entry.date.getTime() <= currentDate.getTime());

        const navOnDate = navEntry ? navEntry.nav : p.purchaseNav;

        totalValue += p.units * navOnDate;
        totalInvested += p.units * p.purchaseNav;
      }

      historyData.push({
        date: formatDate(date),
        totalValue: parseFloat(totalValue.toFixed(2)),
        profitLoss: parseFloat((totalValue - totalInvested).toFixed(2)),
      });
    }

    res.json({
      success: true,
      data: historyData,
    });
  } catch (err) {
    console.error("Portfolio history error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};



export const removeFund = async (req, res) => {
  try {
    const db = req.app.locals.db; 
    const Portfolio = db.collection("Portfolio");

    const { schemeCode, purchaseDate } = req.query;
    const userId = req.user.id;

    console.log("Query received:", req.query);

    // ✅ Validation
    if (!schemeCode) {
      return res.status(400).json({
        success: false,
        message: "schemeCode is required (?schemeCode=153789)"
      });
    }

    if (!purchaseDate) {
      return res.status(400).json({
        success: false,
        message: "purchaseDate is required (eg ?purchaseDate=11-09-2025)"
      });
    }

    if (isNaN(Number(schemeCode))) {
      return res.status(400).json({
        success: false,
        message: "schemeCode must be a number"
      });
    }

    const schemeCodeNum = Number(schemeCode);

    // ✅ Convert dd-mm-yyyy → ISO range
    const [day, month, year] = purchaseDate.split("-");
    if (!day || !month || !year) {
      return res.status(400).json({
        success: false,
        message: "Invalid date format. Use dd-mm-yyyy"
      });
    }

    const startDate = new Date(`${year}-${month}-${day}T00:00:00Z`);
    const endDate = new Date(`${year}-${month}-${day}T23:59:59Z`);

   const result = await Portfolio.deleteOne({
  userId: new ObjectId(userId),
  schemeCode: schemeCodeNum,
  purchaseDate: { $gte: startDate, $lte: endDate } //beacuse date is stored as time zone in my mongod
});

    if (result.deletedCount === 0) {
      return res.status(404).json({
        success: false,
        message: `No matching fund found for schemeCode ${schemeCodeNum} on date ${purchaseDate}`
      });
    }

    res.json({ success: true, message: "Fund removed successfully" });
  } catch (err) {
    console.error("Error in removing the Fund:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
