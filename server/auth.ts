import { Router, Request, Response, NextFunction } from "express";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import * as OTPAuth from "otpauth";
import QRCode from "qrcode";
import { query } from "./db";
import { sendPasswordResetEmail } from "./email";

const router = Router();

const BCRYPT_ROUNDS = 12;
const MAX_ATTEMPTS = 3;
const LOCKOUT_MINUTES = 15;
const SESSION_HOURS = 2;
const RESET_TOKEN_HOURS = 1;
const TEMP_TOKEN_MINUTES = 5;

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not configured.");
  return secret;
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function getClientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0].trim();
  return req.ip || "unknown";
}

async function verifyCaptcha(token: string): Promise<boolean> {
  const secret = process.env.RECAPTCHA_SECRET_KEY;
  if (!secret) return true;
  try {
    const resp = await fetch("https://www.google.com/recaptcha/api/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `secret=${encodeURIComponent(secret)}&response=${encodeURIComponent(token)}`,
      signal: AbortSignal.timeout(5000),
    });
    const data = await resp.json();
    return data.success && (data.score === undefined || data.score >= 0.5);
  } catch {
    return true;
  }
}

async function checkLockout(email: string): Promise<{ locked: boolean; remaining: number }> {
  const since = new Date(Date.now() - LOCKOUT_MINUTES * 60 * 1000).toISOString();
  const result = await query(
    `SELECT COUNT(*) as cnt FROM login_attempts
     WHERE email = $1 AND success = FALSE AND attempted_at > $2`,
    [email.toLowerCase(), since]
  );
  const count = parseInt(result.rows[0].cnt, 10);
  return { locked: count >= MAX_ATTEMPTS, remaining: MAX_ATTEMPTS - count };
}

async function recordAttempt(email: string, ip: string, success: boolean): Promise<void> {
  await query(
    `INSERT INTO login_attempts (email, ip_address, success) VALUES ($1, $2, $3)`,
    [email.toLowerCase(), ip, success]
  );
}

async function createSession(userId: string): Promise<string> {
  const rawToken = crypto.randomBytes(48).toString("hex");
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000);

  await query(
    `INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
    [userId, tokenHash, expiresAt.toISOString()]
  );

  const jwtPayload = { userId, sessionToken: rawToken };
  return jwt.sign(jwtPayload, getJwtSecret(), { expiresIn: `${SESSION_HOURS}h` });
}

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const token = req.cookies?.auth_token;
  if (!token) {
    res.status(401).json({ error: "Not authenticated." });
    return;
  }

  try {
    const decoded = jwt.verify(token, getJwtSecret()) as {
      userId: string;
      sessionToken: string;
    };

    const tokenHash = hashToken(decoded.sessionToken);
    const result = await query(
      `SELECT s.id, s.user_id, u.email, u.totp_enabled
       FROM sessions s JOIN admin_users u ON s.user_id = u.id
       WHERE s.token_hash = $1 AND s.expires_at > NOW()`,
      [tokenHash]
    );

    if (result.rows.length === 0) {
      res.status(401).json({ error: "Session expired." });
      return;
    }

    (req as any).user = {
      id: result.rows[0].user_id,
      email: result.rows[0].email,
      totpEnabled: result.rows[0].totp_enabled,
    };
    next();
  } catch {
    res.status(401).json({ error: "Invalid token." });
  }
}

// ── GET /api/auth/status ──
router.get("/status", async (_req: Request, res: Response) => {
  try {
    const result = await query("SELECT id, totp_enabled FROM admin_users LIMIT 1");
    res.json({
      hasAdmin: result.rows.length > 0,
      is2FAEnabled: result.rows[0]?.totp_enabled || false,
    });
  } catch (err: any) {
    res.status(500).json({ error: "Database error." });
  }
});

// ── POST /api/auth/setup ──
router.post("/setup", async (req: Request, res: Response) => {
  try {
    const { email, password, captchaToken } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: "Email and password are required." });
      return;
    }

    if (captchaToken) {
      const valid = await verifyCaptcha(captchaToken);
      if (!valid) { res.status(403).json({ error: "Captcha verification failed." }); return; }
    }

    const existing = await query("SELECT id FROM admin_users LIMIT 1");
    if (existing.rows.length > 0) {
      res.status(409).json({ error: "Admin account already exists." });
      return;
    }

    if (password.length < 8) {
      res.status(400).json({ error: "Password must be at least 8 characters." });
      return;
    }

    if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
      res.status(400).json({ error: "Password must contain uppercase, lowercase, and a number." });
      return;
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const result = await query(
      `INSERT INTO admin_users (email, password_hash) VALUES ($1, $2) RETURNING id`,
      [email.toLowerCase(), passwordHash]
    );

    const token = await createSession(result.rows[0].id);
    res.cookie("auth_token", token, cookieOpts());
    res.json({ success: true });
  } catch (err: any) {
    if (err.code === "23505") {
      res.status(409).json({ error: "This email is already registered." });
      return;
    }
    console.error("[Auth] Setup error:", err);
    res.status(500).json({ error: "Could not create account." });
  }
});

// ── POST /api/auth/login ──
router.post("/login", async (req: Request, res: Response) => {
  try {
    const { email, password, captchaToken } = req.body;
    const ip = getClientIp(req);

    if (!email || !password) {
      res.status(400).json({ error: "Email and password are required." });
      return;
    }

    if (captchaToken) {
      const valid = await verifyCaptcha(captchaToken);
      if (!valid) { res.status(403).json({ error: "Captcha verification failed." }); return; }
    }

    const lockout = await checkLockout(email);
    if (lockout.locked) {
      res.status(429).json({
        error: `Account temporarily locked. Try again in ${LOCKOUT_MINUTES} minutes.`,
        locked: true,
      });
      return;
    }

    const result = await query(
      "SELECT id, password_hash, totp_enabled, totp_secret FROM admin_users WHERE email = $1",
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      await recordAttempt(email, ip, false);
      res.status(401).json({
        error: "Invalid email or password.",
        attemptsRemaining: lockout.remaining - 1,
      });
      return;
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      await recordAttempt(email, ip, false);
      res.status(401).json({
        error: "Invalid email or password.",
        attemptsRemaining: lockout.remaining - 1,
      });
      return;
    }

    if (user.totp_enabled) {
      const tempToken = jwt.sign(
        { userId: user.id, type: "pre-2fa" },
        getJwtSecret(),
        { expiresIn: `${TEMP_TOKEN_MINUTES}m` }
      );
      res.json({ requires2FA: true, tempToken });
      return;
    }

    await recordAttempt(email, ip, true);
    const token = await createSession(user.id);
    res.cookie("auth_token", token, cookieOpts());
    res.json({ success: true });
  } catch (err: any) {
    console.error("[Auth] Login error:", err);
    res.status(500).json({ error: "Login failed." });
  }
});

// ── POST /api/auth/verify-2fa ──
router.post("/verify-2fa", async (req: Request, res: Response) => {
  try {
    const { code, tempToken } = req.body;

    if (!code || !tempToken) {
      res.status(400).json({ error: "Code and token are required." });
      return;
    }

    let decoded: { userId: string; type: string };
    try {
      decoded = jwt.verify(tempToken, getJwtSecret()) as any;
    } catch {
      res.status(401).json({ error: "Session expired. Please log in again." });
      return;
    }

    if (decoded.type !== "pre-2fa") {
      res.status(401).json({ error: "Invalid token." });
      return;
    }

    const result = await query(
      "SELECT totp_secret FROM admin_users WHERE id = $1",
      [decoded.userId]
    );

    if (result.rows.length === 0 || !result.rows[0].totp_secret) {
      res.status(400).json({ error: "2FA is not configured." });
      return;
    }

    const totp = new OTPAuth.TOTP({
      issuer: "MathomHouse",
      label: "Admin",
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(result.rows[0].totp_secret),
    });

    const delta = totp.validate({ token: code, window: 1 });
    if (delta === null) {
      res.status(401).json({ error: "Invalid 2FA code." });
      return;
    }

    const ip = getClientIp(req);
    const emailResult = await query("SELECT email FROM admin_users WHERE id = $1", [decoded.userId]);
    await recordAttempt(emailResult.rows[0].email, ip, true);

    const sessionToken = await createSession(decoded.userId);
    res.cookie("auth_token", sessionToken, cookieOpts());
    res.json({ success: true });
  } catch (err: any) {
    console.error("[Auth] 2FA verify error:", err);
    res.status(500).json({ error: "Verification failed." });
  }
});

// ── POST /api/auth/logout ──
router.post("/logout", async (req: Request, res: Response) => {
  const token = req.cookies?.auth_token;
  if (token) {
    try {
      const decoded = jwt.verify(token, getJwtSecret()) as any;
      const tokenHash = hashToken(decoded.sessionToken);
      await query("DELETE FROM sessions WHERE token_hash = $1", [tokenHash]);
    } catch {}
  }
  res.clearCookie("auth_token", { path: "/" });
  res.json({ success: true });
});

// ── GET /api/auth/me ──
router.get("/me", authMiddleware as any, (req: Request, res: Response) => {
  const user = (req as any).user;
  res.json({ email: user.email, totpEnabled: user.totpEnabled });
});

// ── POST /api/auth/forgot-password ──
router.post("/forgot-password", async (req: Request, res: Response) => {
  try {
    const { email, captchaToken } = req.body;

    if (!email) {
      res.status(400).json({ error: "Email is required." });
      return;
    }

    if (captchaToken) {
      const valid = await verifyCaptcha(captchaToken);
      if (!valid) { res.status(403).json({ error: "Captcha verification failed." }); return; }
    }

    const result = await query(
      "SELECT id FROM admin_users WHERE email = $1",
      [email.toLowerCase()]
    );

    // Always return success to prevent email enumeration
    if (result.rows.length === 0) {
      res.json({ success: true });
      return;
    }

    const userId = result.rows[0].id;
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + RESET_TOKEN_HOURS * 60 * 60 * 1000);

    // Invalidate previous tokens
    await query(
      "UPDATE password_reset_tokens SET used = TRUE WHERE user_id = $1 AND used = FALSE",
      [userId]
    );

    await query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [userId, tokenHash, expiresAt.toISOString()]
    );

    try {
      await sendPasswordResetEmail(email.toLowerCase(), rawToken);
    } catch (emailErr) {
      console.error("[Auth] Email send error:", emailErr);
    }

    res.json({ success: true });
  } catch (err: any) {
    console.error("[Auth] Forgot password error:", err);
    res.status(500).json({ error: "Could not process request." });
  }
});

// ── POST /api/auth/reset-password ──
router.post("/reset-password", async (req: Request, res: Response) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      res.status(400).json({ error: "Token and new password are required." });
      return;
    }

    if (password.length < 8) {
      res.status(400).json({ error: "Password must be at least 8 characters." });
      return;
    }

    if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
      res.status(400).json({ error: "Password must contain uppercase, lowercase, and a number." });
      return;
    }

    const tokenHash = hashToken(token);
    const result = await query(
      `SELECT id, user_id FROM password_reset_tokens
       WHERE token_hash = $1 AND used = FALSE AND expires_at > NOW()`,
      [tokenHash]
    );

    if (result.rows.length === 0) {
      res.status(400).json({ error: "Invalid or expired reset link." });
      return;
    }

    const { id: tokenId, user_id: userId } = result.rows[0];
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    await query("UPDATE admin_users SET password_hash = $1, updated_at = NOW() WHERE id = $2", [
      passwordHash,
      userId,
    ]);
    await query("UPDATE password_reset_tokens SET used = TRUE WHERE id = $1", [tokenId]);

    // Invalidate all existing sessions
    await query("DELETE FROM sessions WHERE user_id = $1", [userId]);

    res.json({ success: true });
  } catch (err: any) {
    console.error("[Auth] Reset password error:", err);
    res.status(500).json({ error: "Could not reset password." });
  }
});

// ── GET /api/auth/totp/setup ──
router.get("/totp/setup", authMiddleware as any, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const secret = new OTPAuth.Secret({ size: 20 });

    const totp = new OTPAuth.TOTP({
      issuer: "MathomHouse",
      label: user.email,
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret,
    });

    const uri = totp.toString();
    const qrDataUrl = await QRCode.toDataURL(uri);

    // Store secret temporarily (not enabled yet)
    await query("UPDATE admin_users SET totp_secret = $1 WHERE id = $2", [
      secret.base32,
      user.id,
    ]);

    res.json({ qrCode: qrDataUrl, secret: secret.base32 });
  } catch (err: any) {
    console.error("[Auth] TOTP setup error:", err);
    res.status(500).json({ error: "Could not generate 2FA setup." });
  }
});

// ── POST /api/auth/totp/enable ──
router.post("/totp/enable", authMiddleware as any, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { code } = req.body;

    if (!code) {
      res.status(400).json({ error: "Verification code is required." });
      return;
    }

    const result = await query("SELECT totp_secret FROM admin_users WHERE id = $1", [user.id]);
    const secret = result.rows[0]?.totp_secret;
    if (!secret) {
      res.status(400).json({ error: "Run TOTP setup first." });
      return;
    }

    const totp = new OTPAuth.TOTP({
      issuer: "MathomHouse",
      label: user.email,
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(secret),
    });

    const delta = totp.validate({ token: code, window: 1 });
    if (delta === null) {
      res.status(401).json({ error: "Invalid code. Scan the QR again and retry." });
      return;
    }

    await query("UPDATE admin_users SET totp_enabled = TRUE, updated_at = NOW() WHERE id = $1", [
      user.id,
    ]);
    res.json({ success: true });
  } catch (err: any) {
    console.error("[Auth] TOTP enable error:", err);
    res.status(500).json({ error: "Could not enable 2FA." });
  }
});

// ── POST /api/auth/totp/disable ──
router.post("/totp/disable", authMiddleware as any, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { code } = req.body;

    if (!code) {
      res.status(400).json({ error: "Verification code is required." });
      return;
    }

    const result = await query("SELECT totp_secret FROM admin_users WHERE id = $1", [user.id]);
    const secret = result.rows[0]?.totp_secret;
    if (!secret) {
      res.status(400).json({ error: "2FA is not configured." });
      return;
    }

    const totp = new OTPAuth.TOTP({
      issuer: "MathomHouse",
      label: user.email,
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(secret),
    });

    const delta = totp.validate({ token: code, window: 1 });
    if (delta === null) {
      res.status(401).json({ error: "Invalid code." });
      return;
    }

    await query(
      "UPDATE admin_users SET totp_enabled = FALSE, totp_secret = NULL, updated_at = NOW() WHERE id = $1",
      [user.id]
    );
    res.json({ success: true });
  } catch (err: any) {
    console.error("[Auth] TOTP disable error:", err);
    res.status(500).json({ error: "Could not disable 2FA." });
  }
});

function cookieOpts() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_HOURS * 60 * 60 * 1000,
  };
}

export default router;
