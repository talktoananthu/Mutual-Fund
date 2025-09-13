const userApiUsage = new Map();

export const RateLimiterApi = (req, res, next) => {
  const userId = req.user.id; // from authMiddleware (JWT decoded)
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 minute
  const maxRequests = 100;

  let requests = userApiUsage.get(userId) || [];

  // Keep only requests from the last 1 min
  requests = requests.filter((time) => now - time < windowMs);

  if (requests.length >= maxRequests) {
    return res.status(429).json({
      success: false,
      message: "API rate limit exceeded. You can only make 100 requests per minute.",
    });
  }

  // Record this request
  requests.push(now);
  userApiUsage.set(userId, requests);

  next();
};