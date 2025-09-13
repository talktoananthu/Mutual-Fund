import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

 // memory user storage

// Signup 
export const signup = async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const db = req.app.locals.db;
 // email validation regex
   const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    // Password validation regex
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;

 // Validate email
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid email format. Example: user@example.com",
      });
    }

 // Validate Password

    if (!passwordRegex.test(password)) {
      return res.status(400).json({
        success: false,
        message:
          "Password must be at least 8 characters, include 1 uppercase letter, 1 lowercase letter, 1 number, and 1 special character.",
      });
    }

    // Check if user already exists
    const existing = await db.collection("Users").findOne({ email });
    if (existing)
      return res
        .status(400)
        .json({ success: false, message: "User already exists" });

    // Hash password
    const hashed = await bcrypt.hash(password, 10);

    const newUser = {
      email,
      name,
      passwordHash: hashed,
      createdAt: new Date(),
      role: "user",
    };

    

    const result = await db.collection("Users").insertOne(newUser);

    // Create JWT
    const token = jwt.sign(
      { id: result.insertedId.toString(), email },
      process.env.JWT_SECRET,
      { expiresIn: "24h" }
    );

    res.json({
      success: true,
      message: "User registered",
      token,
      user: { id: result.insertedId, name, email, role: "user" }, // safer, don't return passwordHash
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Login

const loginAttempts = new Map();

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const db = req.app.locals.db;
//checking email validation
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Validate email
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid email format. Example: user@example.com",
      });
    }

    const ip = req.ip; // Get user IP address

    const now = Date.now();
    const windowMs = 60 * 1000; // 1 minute
    const maxAttempts = 5;





    // Get attempts for this IP
    let attempts = loginAttempts.get(ip) || { count: 0, firstAttempt: now };

    // Reset window if time has passed
    if (now - attempts.firstAttempt > windowMs) {
      attempts = { count: 0, firstAttempt: now };
    }

    // If too many attempts
    if (attempts.count >= maxAttempts) {
      return res.status(429).json({
        success: false,
        message: "Too many login attempts. Try again after 1 minute.",
      });
    }

    // Find user
    const user = await db.collection("Users").findOne({ email });
    if (!user) {
      attempts.count++;
      loginAttempts.set(ip, attempts);
      return res.status(400).json({ success: false, message: "User not found" });
    }

    // Validate password
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      attempts.count++;
      loginAttempts.set(ip, attempts);
      return res.status(400).json({ success: false, message: "Invalid credentials" });
    }

    // Successful login → reset attempts for IP
    loginAttempts.delete(ip);

    // Create JWT
    const token = jwt.sign(
      { id: user._id.toString(), email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "24h" }
    );

    res.json({
      success: true,
      message: "Login successful",
      token,
      user,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
