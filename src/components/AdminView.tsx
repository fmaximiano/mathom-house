import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  X, Plus, Trash2, Pencil, Save, Scroll, Hammer, Archive,
  Telescope, Lock, KeyRound, Check, AlertTriangle, Mail,
  ShieldCheck, ShieldOff, Loader2, ArrowLeft, Settings, LogOut,
} from "lucide-react";
import { RiddleItem, ProjectItem, MathomItem, SecretSpot } from "../types";
import {
  getRiddles, saveRiddles,
  getProjects, saveProjects,
  getMathoms, saveMathoms,
  getSecrets, saveSecrets,
} from "../storage";

const RECAPTCHA_SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY || "";

type AuthScreen = "loading" | "setup" | "login" | "verify-2fa" | "forgot-password" | "reset-password" | "authenticated";
type AdminTab = "riddles" | "projects" | "mathoms" | "secrets" | "settings";

// ── reCAPTCHA v3 helpers ──

function loadRecaptchaScript(): Promise<void> {
  return new Promise((resolve) => {
    if ((window as any).grecaptcha) { resolve(); return; }
    const existing = document.querySelector(`script[src*="recaptcha"]`);
    if (existing) { resolve(); return; }
    const script = document.createElement("script");
    script.src = `https://www.google.com/recaptcha/api.js?render=${RECAPTCHA_SITE_KEY}`;
    script.onload = () => resolve();
    document.head.appendChild(script);
  });
}

async function getCaptchaToken(action: string): Promise<string> {
  if (!RECAPTCHA_SITE_KEY) return "";
  await loadRecaptchaScript();
  return new Promise((resolve) => {
    (window as any).grecaptcha.ready(() => {
      (window as any).grecaptcha.execute(RECAPTCHA_SITE_KEY, { action }).then(resolve);
    });
  });
}

// ── Main AdminView ──

interface AdminViewProps {
  onClose: () => void;
  isDark: boolean;
}

export default function AdminView({ onClose, isDark }: AdminViewProps) {
  const [screen, setScreen] = useState<AuthScreen>("loading");
  const [tempToken, setTempToken] = useState("");
  const [resetToken, setResetToken] = useState("");

  useEffect(() => {
    checkAuth();
    const hash = window.location.hash;
    const match = hash.match(/^#reset-password\/(.+)$/);
    if (match) {
      setResetToken(match[1]);
      setScreen("reset-password");
      window.location.hash = "";
    }
  }, []);

  async function checkAuth() {
    try {
      const resp = await fetch("/api/auth/me");
      if (resp.ok) { setScreen("authenticated"); return; }
      const status = await fetch("/api/auth/status").then((r) => r.json());
      setScreen(status.hasAdmin ? "login" : "setup");
    } catch {
      setScreen("login");
    }
  }

  function handleLoginSuccess() { setScreen("authenticated"); }
  function handleNeeds2FA(token: string) { setTempToken(token); setScreen("verify-2fa"); }
  function handleLogout() {
    fetch("/api/auth/logout", { method: "POST" });
    setScreen("login");
  }

  return (
    <AnimatePresence>
      {screen === "loading" && <AuthOverlay isDark={isDark} onClose={onClose}><LoadingScreen isDark={isDark} /></AuthOverlay>}
      {screen === "setup" && <AuthOverlay isDark={isDark} onClose={onClose}><SetupScreen isDark={isDark} onSuccess={handleLoginSuccess} /></AuthOverlay>}
      {screen === "login" && (
        <AuthOverlay isDark={isDark} onClose={onClose}>
          <LoginScreen isDark={isDark} onSuccess={handleLoginSuccess} onNeeds2FA={handleNeeds2FA} onForgotPassword={() => setScreen("forgot-password")} />
        </AuthOverlay>
      )}
      {screen === "verify-2fa" && (
        <AuthOverlay isDark={isDark} onClose={onClose}>
          <Verify2FAScreen isDark={isDark} tempToken={tempToken} onSuccess={handleLoginSuccess} onBack={() => setScreen("login")} />
        </AuthOverlay>
      )}
      {screen === "forgot-password" && (
        <AuthOverlay isDark={isDark} onClose={onClose}>
          <ForgotPasswordScreen isDark={isDark} onBack={() => setScreen("login")} />
        </AuthOverlay>
      )}
      {screen === "reset-password" && (
        <AuthOverlay isDark={isDark} onClose={onClose}>
          <ResetPasswordScreen isDark={isDark} token={resetToken} onSuccess={() => setScreen("login")} />
        </AuthOverlay>
      )}
      {screen === "authenticated" && <AdminPanel onClose={onClose} isDark={isDark} onLogout={handleLogout} />}
    </AnimatePresence>
  );
}

// ── Auth Overlay Container ──

function AuthOverlay({ isDark, onClose, children }: { isDark: boolean; onClose: () => void; children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className={`w-full max-w-md rounded-3xl p-8 shadow-2xl ${
          isDark ? "bg-[#1A1714] border border-white/10 text-neutral-100" : "bg-white border border-stone-200 text-stone-800"
        }`}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

// ── Loading ──

function LoadingScreen({ isDark }: { isDark: boolean }) {
  return (
    <div className="flex flex-col items-center gap-3 py-6">
      <Loader2 className="w-6 h-6 animate-spin text-[#C5A059]" />
      <p className={`text-sm ${isDark ? "text-neutral-400" : "text-stone-500"}`}>Checking credentials...</p>
    </div>
  );
}

// ── Setup (first-time admin creation) ──

function SetupScreen({ isDark, onSuccess }: { isDark: boolean; onSuccess: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    if (!email || !password) { setError("All fields are required."); return; }
    if (password !== confirm) { setError("Passwords do not match."); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    setLoading(true); setError("");
    try {
      const captchaToken = await getCaptchaToken("setup");
      const resp = await fetch("/api/auth/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, captchaToken }),
      });
      const data = await resp.json();
      if (!resp.ok) { setError(data.error); return; }
      onSuccess();
    } catch { setError("Connection failed."); }
    finally { setLoading(false); }
  }

  const inputCls = `w-full px-4 py-3 rounded-xl text-sm outline-none transition-all ${
    isDark
      ? "bg-[#12100E] border border-neutral-800 focus:border-[#C5A059]/50 text-neutral-100 placeholder:text-neutral-600"
      : "bg-stone-50 border border-stone-200 focus:border-[#C5A059]/50 text-stone-800 placeholder:text-stone-400"
  }`;

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-[#C5A059]/10 border border-[#C5A059]/30 flex items-center justify-center">
          <KeyRound className="w-5 h-5 text-[#C5A059]" />
        </div>
        <div>
          <h2 className="text-lg font-bold font-serif">Create Admin Account</h2>
          <p className={`text-xs ${isDark ? "text-neutral-500" : "text-stone-400"}`}>First-time setup for Mathom House</p>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email address" className={inputCls} />
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password (min 8, upper+lower+number)" className={inputCls} />
        <input
          type="password" value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          placeholder="Confirm password" className={inputCls}
        />
        {error && <p className="text-xs text-red-400 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> {error}</p>}
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="cursor-pointer w-full py-3 rounded-xl text-sm font-bold bg-[#C5A059] hover:bg-[#b08c48] text-neutral-950 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          Create Account
        </button>
      </div>
    </div>
  );
}

// ── Login ──

function LoginScreen({ isDark, onSuccess, onNeeds2FA, onForgotPassword }: {
  isDark: boolean; onSuccess: () => void; onNeeds2FA: (token: string) => void; onForgotPassword: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [attemptsInfo, setAttemptsInfo] = useState("");

  async function handleSubmit() {
    if (!email || !password) { setError("Email and password are required."); return; }
    setLoading(true); setError(""); setAttemptsInfo("");
    try {
      const captchaToken = await getCaptchaToken("login");
      const resp = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, captchaToken }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        setError(data.error);
        if (data.locked) setAttemptsInfo("Account locked due to too many failed attempts.");
        else if (data.attemptsRemaining !== undefined) setAttemptsInfo(`${data.attemptsRemaining} attempt(s) remaining.`);
        return;
      }
      if (data.requires2FA) { onNeeds2FA(data.tempToken); return; }
      onSuccess();
    } catch { setError("Connection failed."); }
    finally { setLoading(false); }
  }

  const inputCls = `w-full px-4 py-3 rounded-xl text-sm outline-none transition-all ${
    isDark
      ? "bg-[#12100E] border border-neutral-800 focus:border-[#C5A059]/50 text-neutral-100 placeholder:text-neutral-600"
      : "bg-stone-50 border border-stone-200 focus:border-[#C5A059]/50 text-stone-800 placeholder:text-stone-400"
  }`;

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-[#C5A059]/10 border border-[#C5A059]/30 flex items-center justify-center">
          <Lock className="w-5 h-5 text-[#C5A059]" />
        </div>
        <div>
          <h2 className="text-lg font-bold font-serif">Admin Login</h2>
          <p className={`text-xs ${isDark ? "text-neutral-500" : "text-stone-400"}`}>Enter your credentials</p>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email address" className={inputCls} />
        <input
          type="password" value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          placeholder="Password" className={inputCls}
        />
        {error && <p className="text-xs text-red-400 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> {error}</p>}
        {attemptsInfo && <p className="text-xs text-amber-400">{attemptsInfo}</p>}
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="cursor-pointer w-full py-3 rounded-xl text-sm font-bold bg-[#C5A059] hover:bg-[#b08c48] text-neutral-950 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
          Sign In
        </button>
        <button
          onClick={onForgotPassword}
          className={`cursor-pointer text-xs text-center py-1 transition-colors ${isDark ? "text-neutral-500 hover:text-neutral-300" : "text-stone-400 hover:text-stone-600"}`}
        >
          Forgot password?
        </button>
      </div>
    </div>
  );
}

// ── 2FA Verification ──

function Verify2FAScreen({ isDark, tempToken, onSuccess, onBack }: {
  isDark: boolean; tempToken: string; onSuccess: () => void; onBack: () => void;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    if (code.length !== 6) { setError("Enter the 6-digit code."); return; }
    setLoading(true); setError("");
    try {
      const resp = await fetch("/api/auth/verify-2fa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, tempToken }),
      });
      const data = await resp.json();
      if (!resp.ok) { setError(data.error); return; }
      onSuccess();
    } catch { setError("Connection failed."); }
    finally { setLoading(false); }
  }

  const inputCls = `w-full px-4 py-3 rounded-xl text-sm text-center font-mono tracking-[0.5em] outline-none transition-all ${
    isDark
      ? "bg-[#12100E] border border-neutral-800 focus:border-[#C5A059]/50 text-neutral-100"
      : "bg-stone-50 border border-stone-200 focus:border-[#C5A059]/50 text-stone-800"
  }`;

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-[#C5A059]/10 border border-[#C5A059]/30 flex items-center justify-center">
          <ShieldCheck className="w-5 h-5 text-[#C5A059]" />
        </div>
        <div>
          <h2 className="text-lg font-bold font-serif">Two-Factor Authentication</h2>
          <p className={`text-xs ${isDark ? "text-neutral-500" : "text-stone-400"}`}>Enter the code from your authenticator app</p>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <input
          type="text" value={code} maxLength={6} inputMode="numeric" pattern="[0-9]*"
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          placeholder="000000" className={inputCls} autoFocus
        />
        {error && <p className="text-xs text-red-400 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> {error}</p>}
        <button
          onClick={handleSubmit}
          disabled={loading || code.length !== 6}
          className="cursor-pointer w-full py-3 rounded-xl text-sm font-bold bg-[#C5A059] hover:bg-[#b08c48] text-neutral-950 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          Verify
        </button>
        <button onClick={onBack} className={`cursor-pointer text-xs flex items-center justify-center gap-1 py-1 ${isDark ? "text-neutral-500 hover:text-neutral-300" : "text-stone-400 hover:text-stone-600"}`}>
          <ArrowLeft className="w-3 h-3" /> Back to login
        </button>
      </div>
    </div>
  );
}

// ── Forgot Password ──

function ForgotPasswordScreen({ isDark, onBack }: { isDark: boolean; onBack: () => void }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    if (!email) { setError("Email is required."); return; }
    setLoading(true); setError("");
    try {
      const captchaToken = await getCaptchaToken("forgot_password");
      const resp = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, captchaToken }),
      });
      const data = await resp.json();
      if (!resp.ok) { setError(data.error); return; }
      setSent(true);
    } catch { setError("Connection failed."); }
    finally { setLoading(false); }
  }

  const inputCls = `w-full px-4 py-3 rounded-xl text-sm outline-none transition-all ${
    isDark
      ? "bg-[#12100E] border border-neutral-800 focus:border-[#C5A059]/50 text-neutral-100 placeholder:text-neutral-600"
      : "bg-stone-50 border border-stone-200 focus:border-[#C5A059]/50 text-stone-800 placeholder:text-stone-400"
  }`;

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-[#C5A059]/10 border border-[#C5A059]/30 flex items-center justify-center">
          <Mail className="w-5 h-5 text-[#C5A059]" />
        </div>
        <div>
          <h2 className="text-lg font-bold font-serif">Password Recovery</h2>
          <p className={`text-xs ${isDark ? "text-neutral-500" : "text-stone-400"}`}>We'll send a reset link to your email</p>
        </div>
      </div>

      {sent ? (
        <div className="flex flex-col gap-4">
          <div className={`p-4 rounded-xl text-sm ${isDark ? "bg-green-900/20 text-green-300 border border-green-800/30" : "bg-green-50 text-green-700 border border-green-200"}`}>
            If an account with that email exists, a reset link has been sent. Check your inbox.
          </div>
          <button onClick={onBack} className={`cursor-pointer text-xs flex items-center justify-center gap-1 py-1 ${isDark ? "text-neutral-500 hover:text-neutral-300" : "text-stone-400 hover:text-stone-600"}`}>
            <ArrowLeft className="w-3 h-3" /> Back to login
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <input
            type="email" value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            placeholder="Email address" className={inputCls}
          />
          {error && <p className="text-xs text-red-400 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> {error}</p>}
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="cursor-pointer w-full py-3 rounded-xl text-sm font-bold bg-[#C5A059] hover:bg-[#b08c48] text-neutral-950 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
            Send Reset Link
          </button>
          <button onClick={onBack} className={`cursor-pointer text-xs flex items-center justify-center gap-1 py-1 ${isDark ? "text-neutral-500 hover:text-neutral-300" : "text-stone-400 hover:text-stone-600"}`}>
            <ArrowLeft className="w-3 h-3" /> Back to login
          </button>
        </div>
      )}
    </div>
  );
}

// ── Reset Password ──

function ResetPasswordScreen({ isDark, token, onSuccess }: { isDark: boolean; token: string; onSuccess: () => void }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit() {
    if (password !== confirm) { setError("Passwords do not match."); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    setLoading(true); setError("");
    try {
      const resp = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await resp.json();
      if (!resp.ok) { setError(data.error); return; }
      setDone(true);
    } catch { setError("Connection failed."); }
    finally { setLoading(false); }
  }

  const inputCls = `w-full px-4 py-3 rounded-xl text-sm outline-none transition-all ${
    isDark
      ? "bg-[#12100E] border border-neutral-800 focus:border-[#C5A059]/50 text-neutral-100 placeholder:text-neutral-600"
      : "bg-stone-50 border border-stone-200 focus:border-[#C5A059]/50 text-stone-800 placeholder:text-stone-400"
  }`;

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-[#C5A059]/10 border border-[#C5A059]/30 flex items-center justify-center">
          <KeyRound className="w-5 h-5 text-[#C5A059]" />
        </div>
        <div>
          <h2 className="text-lg font-bold font-serif">Set New Password</h2>
          <p className={`text-xs ${isDark ? "text-neutral-500" : "text-stone-400"}`}>Choose a strong password</p>
        </div>
      </div>

      {done ? (
        <div className="flex flex-col gap-4">
          <div className={`p-4 rounded-xl text-sm ${isDark ? "bg-green-900/20 text-green-300 border border-green-800/30" : "bg-green-50 text-green-700 border border-green-200"}`}>
            Password updated successfully. You can now log in.
          </div>
          <button onClick={onSuccess} className="cursor-pointer w-full py-3 rounded-xl text-sm font-bold bg-[#C5A059] hover:bg-[#b08c48] text-neutral-950 transition-all">
            Go to Login
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="New password (min 8, upper+lower+number)" className={inputCls} />
          <input
            type="password" value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            placeholder="Confirm new password" className={inputCls}
          />
          {error && <p className="text-xs text-red-400 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> {error}</p>}
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="cursor-pointer w-full py-3 rounded-xl text-sm font-bold bg-[#C5A059] hover:bg-[#b08c48] text-neutral-950 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Update Password
          </button>
        </div>
      )}
    </div>
  );
}

// ============================================================
// ADMIN PANEL (authenticated)
// ============================================================

function AdminPanel({ onClose, isDark, onLogout }: { onClose: () => void; isDark: boolean; onLogout: () => void }) {
  const [tab, setTab] = useState<AdminTab>("riddles");

  const tabs: { id: AdminTab; label: string; icon: typeof Scroll }[] = [
    { id: "riddles", label: "Riddles", icon: Scroll },
    { id: "projects", label: "Projects", icon: Hammer },
    { id: "mathoms", label: "Mathoms", icon: Archive },
    { id: "secrets", label: "Secrets", icon: Telescope },
    { id: "settings", label: "Security", icon: Settings },
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex flex-col bg-black/60 backdrop-blur-sm"
    >
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 40, opacity: 0 }}
        className={`m-4 md:m-8 flex-1 flex flex-col rounded-3xl shadow-2xl overflow-hidden ${
          isDark ? "bg-[#1A1714] border border-white/10 text-neutral-100" : "bg-[#FAFAF8] border border-stone-200 text-stone-800"
        }`}
      >
        <div className={`flex items-center justify-between px-6 py-4 border-b shrink-0 ${isDark ? "border-white/5" : "border-stone-200"}`}>
          <div className="flex items-center gap-3">
            <Lock className="w-4 h-4 text-[#C5A059]" />
            <h1 className="text-lg font-bold font-serif">Admin Chambers</h1>
          </div>
          <div className="flex items-center gap-4">
            <nav className={`flex gap-1 p-1 rounded-xl ${isDark ? "bg-[#12100E]/80" : "bg-stone-100"}`}>
              {tabs.map((t) => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    className={`cursor-pointer relative px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                      tab === t.id ? "text-[#C5A059]" : isDark ? "text-neutral-500 hover:text-neutral-300" : "text-stone-400 hover:text-stone-600"
                    }`}
                  >
                    {tab === t.id && <motion.div layoutId="admin-tab-pill" className="absolute inset-0 bg-[#C5A059]/10 border border-[#C5A059]/20 rounded-lg" />}
                    <Icon className="w-3.5 h-3.5 relative z-10" />
                    <span className="relative z-10 hidden sm:inline">{t.label}</span>
                  </button>
                );
              })}
            </nav>
            <button onClick={onLogout} title="Sign out" className={`cursor-pointer p-2 rounded-xl transition-all ${isDark ? "hover:bg-white/5 text-neutral-500" : "hover:bg-stone-100 text-stone-400"}`}>
              <LogOut className="w-4 h-4" />
            </button>
            <button onClick={onClose} className={`cursor-pointer p-2 rounded-xl transition-all ${isDark ? "hover:bg-white/5" : "hover:bg-stone-100"}`}>
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
          {tab === "riddles" && <RiddlesAdmin isDark={isDark} />}
          {tab === "projects" && <ProjectsAdmin isDark={isDark} />}
          {tab === "mathoms" && <MathomsAdmin isDark={isDark} />}
          {tab === "secrets" && <SecretsAdmin isDark={isDark} />}
          {tab === "settings" && <SecuritySettings isDark={isDark} />}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ============================================================
// SECURITY SETTINGS (2FA)
// ============================================================

function SecuritySettings({ isDark }: { isDark: boolean }) {
  const [totpEnabled, setTotpEnabled] = useState(false);
  const [qrCode, setQrCode] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"idle" | "setup" | "disable">("idle");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then((data) => {
      setTotpEnabled(data.totpEnabled || false);
    });
  }, []);

  async function startSetup() {
    setLoading(true); setError("");
    try {
      const resp = await fetch("/api/auth/totp/setup");
      const data = await resp.json();
      if (!resp.ok) { setError(data.error); return; }
      setQrCode(data.qrCode);
      setSecret(data.secret);
      setStep("setup");
    } catch { setError("Connection failed."); }
    finally { setLoading(false); }
  }

  async function enableTotp() {
    if (code.length !== 6) { setError("Enter the 6-digit code."); return; }
    setLoading(true); setError("");
    try {
      const resp = await fetch("/api/auth/totp/enable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await resp.json();
      if (!resp.ok) { setError(data.error); return; }
      setTotpEnabled(true);
      setStep("idle");
      setCode("");
      setMessage("Two-factor authentication enabled successfully.");
      setTimeout(() => setMessage(""), 5000);
    } catch { setError("Connection failed."); }
    finally { setLoading(false); }
  }

  async function disableTotp() {
    if (code.length !== 6) { setError("Enter the 6-digit code to confirm."); return; }
    setLoading(true); setError("");
    try {
      const resp = await fetch("/api/auth/totp/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await resp.json();
      if (!resp.ok) { setError(data.error); return; }
      setTotpEnabled(false);
      setStep("idle");
      setCode("");
      setMessage("Two-factor authentication disabled.");
      setTimeout(() => setMessage(""), 5000);
    } catch { setError("Connection failed."); }
    finally { setLoading(false); }
  }

  const inputCls = `w-full px-4 py-3 rounded-xl text-sm text-center font-mono tracking-[0.5em] outline-none transition-all ${
    isDark
      ? "bg-[#12100E] border border-neutral-800 focus:border-[#C5A059]/50 text-neutral-100"
      : "bg-white border border-stone-200 focus:border-[#C5A059]/50 text-stone-800"
  }`;

  return (
    <div className="max-w-lg mx-auto">
      <h3 className="text-sm font-bold mb-6 flex items-center gap-2">
        <ShieldCheck className="w-4 h-4 text-[#C5A059]" />
        Two-Factor Authentication (TOTP)
      </h3>

      {message && (
        <div className={`mb-4 p-3 rounded-xl text-sm ${isDark ? "bg-green-900/20 text-green-300 border border-green-800/30" : "bg-green-50 text-green-700 border border-green-200"}`}>
          {message}
        </div>
      )}

      <div className={`rounded-2xl p-6 ${isDark ? "bg-[#12100E]/50 border border-white/5" : "bg-white border border-stone-200"}`}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className={`text-sm font-medium ${isDark ? "text-neutral-200" : "text-stone-700"}`}>Authenticator App</p>
            <p className={`text-xs ${isDark ? "text-neutral-500" : "text-stone-400"}`}>
              {totpEnabled ? "Active — an authenticator code is required at login" : "Not enabled — add an extra layer of security"}
            </p>
          </div>
          <span className={`text-xs font-mono px-2 py-1 rounded-lg ${
            totpEnabled
              ? "bg-green-500/10 text-green-400 border border-green-500/20"
              : isDark ? "bg-neutral-800 text-neutral-500" : "bg-stone-100 text-stone-400"
          }`}>
            {totpEnabled ? "Enabled" : "Disabled"}
          </span>
        </div>

        {step === "idle" && (
          <button
            onClick={totpEnabled ? () => { setStep("disable"); setCode(""); setError(""); } : startSetup}
            disabled={loading}
            className={`cursor-pointer w-full py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
              totpEnabled
                ? "bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20"
                : "bg-[#C5A059] hover:bg-[#b08c48] text-neutral-950"
            }`}
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> :
              totpEnabled ? <><ShieldOff className="w-3.5 h-3.5" /> Disable 2FA</> : <><ShieldCheck className="w-3.5 h-3.5" /> Enable 2FA</>
            }
          </button>
        )}

        {step === "setup" && (
          <div className="flex flex-col items-center gap-4 mt-4">
            <p className={`text-xs text-center ${isDark ? "text-neutral-400" : "text-stone-500"}`}>
              Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)
            </p>
            {qrCode && <img src={qrCode} alt="TOTP QR Code" className="w-48 h-48 rounded-xl border border-[#C5A059]/20" />}
            <div className={`w-full p-3 rounded-lg text-[10px] font-mono break-all ${isDark ? "bg-neutral-900 text-neutral-500" : "bg-stone-50 text-stone-400"}`}>
              Manual key: {secret}
            </div>
            <input
              type="text" value={code} maxLength={6} inputMode="numeric" pattern="[0-9]*"
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              onKeyDown={(e) => e.key === "Enter" && enableTotp()}
              placeholder="000000" className={inputCls}
            />
            {error && <p className="text-xs text-red-400 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> {error}</p>}
            <div className="flex gap-2 w-full">
              <button onClick={() => { setStep("idle"); setCode(""); setError(""); }}
                className={`cursor-pointer flex-1 py-2.5 rounded-xl text-xs font-medium ${isDark ? "bg-neutral-800 text-neutral-300" : "bg-stone-100 text-stone-600"}`}>
                Cancel
              </button>
              <button onClick={enableTotp} disabled={loading || code.length !== 6}
                className="cursor-pointer flex-1 py-2.5 rounded-xl text-xs font-bold bg-[#C5A059] hover:bg-[#b08c48] text-neutral-950 transition-all disabled:opacity-50">
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin mx-auto" /> : "Verify & Enable"}
              </button>
            </div>
          </div>
        )}

        {step === "disable" && (
          <div className="flex flex-col gap-3 mt-4">
            <p className={`text-xs ${isDark ? "text-neutral-400" : "text-stone-500"}`}>
              Enter a code from your authenticator app to confirm disabling 2FA.
            </p>
            <input
              type="text" value={code} maxLength={6} inputMode="numeric" pattern="[0-9]*"
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              onKeyDown={(e) => e.key === "Enter" && disableTotp()}
              placeholder="000000" className={inputCls}
            />
            {error && <p className="text-xs text-red-400 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> {error}</p>}
            <div className="flex gap-2">
              <button onClick={() => { setStep("idle"); setCode(""); setError(""); }}
                className={`cursor-pointer flex-1 py-2.5 rounded-xl text-xs font-medium ${isDark ? "bg-neutral-800 text-neutral-300" : "bg-stone-100 text-stone-600"}`}>
                Cancel
              </button>
              <button onClick={disableTotp} disabled={loading || code.length !== 6}
                className="cursor-pointer flex-1 py-2.5 rounded-xl text-xs font-bold bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/20 transition-all disabled:opacity-50">
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin mx-auto" /> : "Confirm Disable"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// CONTENT ADMIN TABS (riddles, projects, mathoms, secrets)
// ============================================================

function RiddlesAdmin({ isDark }: { isDark: boolean }) {
  const [riddles, setRiddles] = useState<RiddleItem[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({ question: "", answer: "", hint: "" });

  useEffect(() => { setRiddles(getRiddles()); }, []);

  function persist(updated: RiddleItem[]) { setRiddles(updated); saveRiddles(updated); window.dispatchEvent(new Event("riddles-updated")); }
  function handleAdd() {
    if (!form.question.trim() || !form.answer.trim()) return;
    persist([...riddles, { id: `r_${Date.now()}`, question: form.question.trim(), answer: form.answer.trim(), hint: form.hint.trim() || undefined }]);
    setForm({ question: "", answer: "", hint: "" });
  }
  function handleDelete(id: string) { persist(riddles.filter((r) => r.id !== id)); }
  function handleEdit(r: RiddleItem) { setEditing(r.id); setForm({ question: r.question, answer: r.answer, hint: r.hint || "" }); }
  function handleSaveEdit() {
    if (!editing) return;
    persist(riddles.map((r) => r.id === editing ? { ...r, question: form.question.trim(), answer: form.answer.trim(), hint: form.hint.trim() || undefined } : r));
    setEditing(null); setForm({ question: "", answer: "", hint: "" });
  }
  function cancelEdit() { setEditing(null); setForm({ question: "", answer: "", hint: "" }); }

  const inputCls = `w-full px-3 py-2 rounded-lg text-sm outline-none transition-all ${isDark ? "bg-[#12100E] border border-neutral-800 focus:border-[#C5A059]/50 text-neutral-100 placeholder:text-neutral-600" : "bg-white border border-stone-200 focus:border-[#C5A059]/50 text-stone-800 placeholder:text-stone-400"}`;

  return (
    <div className="max-w-3xl mx-auto">
      <div className={`rounded-2xl p-5 mb-6 ${isDark ? "bg-[#12100E]/50 border border-white/5" : "bg-white border border-stone-200"}`}>
        <h3 className="text-sm font-bold mb-3 flex items-center gap-2"><Plus className="w-4 h-4 text-[#C5A059]" />{editing ? "Edit Riddle" : "Add New Riddle"}</h3>
        <div className="flex flex-col gap-2">
          <textarea value={form.question} onChange={(e) => setForm({ ...form, question: e.target.value })} placeholder="The riddle question..." rows={2} className={inputCls} />
          <input value={form.answer} onChange={(e) => setForm({ ...form, answer: e.target.value })} placeholder="Answer" className={inputCls} />
          <input value={form.hint} onChange={(e) => setForm({ ...form, hint: e.target.value })} placeholder="Hint (optional)" className={inputCls} />
          <div className="flex gap-2 mt-1">
            {editing && <button onClick={cancelEdit} className={`cursor-pointer px-4 py-2 rounded-lg text-xs font-medium ${isDark ? "bg-neutral-800 text-neutral-300" : "bg-stone-100 text-stone-600"}`}>Cancel</button>}
            <button onClick={editing ? handleSaveEdit : handleAdd} className="cursor-pointer px-4 py-2 rounded-lg text-xs font-bold bg-[#C5A059] hover:bg-[#b08c48] text-neutral-950 transition-all flex items-center gap-1.5">
              {editing ? <Save className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}{editing ? "Save Changes" : "Add Riddle"}
            </button>
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {riddles.map((r, i) => (
          <motion.div key={r.id} layout initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className={`rounded-xl p-4 flex items-start justify-between gap-3 transition-all ${isDark ? "bg-[#12100E]/50 border border-white/5 hover:border-white/10" : "bg-white border border-stone-200 hover:border-stone-300"}`}>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-mono text-[#C5A059] mb-1">#{i + 1}</p>
              <p className={`text-sm leading-relaxed ${isDark ? "text-neutral-200" : "text-stone-700"}`}>{r.question}</p>
              <p className={`text-xs mt-1 font-mono ${isDark ? "text-neutral-500" : "text-stone-400"}`}>Answer: {r.answer}</p>
              {r.hint && <p className={`text-xs mt-0.5 italic ${isDark ? "text-neutral-600" : "text-stone-400"}`}>Hint: {r.hint}</p>}
            </div>
            <div className="flex gap-1 shrink-0">
              <button onClick={() => handleEdit(r)} className={`cursor-pointer p-2 rounded-lg transition-all ${isDark ? "hover:bg-white/5 text-neutral-500" : "hover:bg-stone-100 text-stone-400"}`}><Pencil className="w-3.5 h-3.5" /></button>
              <button onClick={() => handleDelete(r.id)} className="cursor-pointer p-2 rounded-lg hover:bg-red-500/10 text-red-400 transition-all"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          </motion.div>
        ))}
      </div>
      {riddles.length === 0 && <p className={`text-center text-sm italic py-8 ${isDark ? "text-neutral-600" : "text-stone-400"}`}>No riddles yet. Add the first one above.</p>}
    </div>
  );
}

const PROJECT_CATEGORIES = ["Automation", "Web App", "AI Experiment", "Craft"] as const;

function ProjectsAdmin({ isDark }: { isDark: boolean }) {
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", description: "", category: "Automation" as ProjectItem["category"], tags: "", link: "" });

  useEffect(() => { setProjects(getProjects()); }, []);

  function persist(updated: ProjectItem[]) { setProjects(updated); saveProjects(updated); }
  function handleAdd() {
    if (!form.title.trim() || !form.description.trim()) return;
    persist([...projects, { id: `p_${Date.now()}`, title: form.title.trim(), description: form.description.trim(), category: form.category, tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean), link: form.link.trim() || undefined }]);
    setForm({ title: "", description: "", category: "Automation", tags: "", link: "" });
  }
  function handleDelete(id: string) { persist(projects.filter((p) => p.id !== id)); }
  function handleEdit(p: ProjectItem) { setEditing(p.id); setForm({ title: p.title, description: p.description, category: p.category, tags: p.tags.join(", "), link: p.link || "" }); }
  function handleSaveEdit() {
    if (!editing) return;
    persist(projects.map((p) => p.id === editing ? { ...p, title: form.title.trim(), description: form.description.trim(), category: form.category, tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean), link: form.link.trim() || undefined } : p));
    setEditing(null); setForm({ title: "", description: "", category: "Automation", tags: "", link: "" });
  }
  function cancelEdit() { setEditing(null); setForm({ title: "", description: "", category: "Automation", tags: "", link: "" }); }

  const inputCls = `w-full px-3 py-2 rounded-lg text-sm outline-none transition-all ${isDark ? "bg-[#12100E] border border-neutral-800 focus:border-[#C5A059]/50 text-neutral-100 placeholder:text-neutral-600" : "bg-white border border-stone-200 focus:border-[#C5A059]/50 text-stone-800 placeholder:text-stone-400"}`;

  return (
    <div className="max-w-3xl mx-auto">
      <div className={`rounded-2xl p-5 mb-6 ${isDark ? "bg-[#12100E]/50 border border-white/5" : "bg-white border border-stone-200"}`}>
        <h3 className="text-sm font-bold mb-3 flex items-center gap-2"><Plus className="w-4 h-4 text-[#C5A059]" />{editing ? "Edit Project" : "Add New Project"}</h3>
        <div className="flex flex-col gap-2">
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Project title" className={inputCls} />
          <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Description" rows={2} className={inputCls} />
          <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as ProjectItem["category"] })} className={inputCls}>
            {PROJECT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="Tags (comma-separated)" className={inputCls} />
          <input value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })} placeholder="Link (optional)" className={inputCls} />
          <div className="flex gap-2 mt-1">
            {editing && <button onClick={cancelEdit} className={`cursor-pointer px-4 py-2 rounded-lg text-xs font-medium ${isDark ? "bg-neutral-800 text-neutral-300" : "bg-stone-100 text-stone-600"}`}>Cancel</button>}
            <button onClick={editing ? handleSaveEdit : handleAdd} className="cursor-pointer px-4 py-2 rounded-lg text-xs font-bold bg-[#C5A059] hover:bg-[#b08c48] text-neutral-950 transition-all flex items-center gap-1.5">
              {editing ? <Save className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}{editing ? "Save Changes" : "Add Project"}
            </button>
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {projects.map((p) => (
          <motion.div key={p.id} layout initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className={`rounded-xl p-4 flex items-start justify-between gap-3 transition-all ${isDark ? "bg-[#12100E]/50 border border-white/5 hover:border-white/10" : "bg-white border border-stone-200 hover:border-stone-300"}`}>
            <div className="flex-1 min-w-0">
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-[#C5A059]/10 text-[#C5A059]">{p.category}</span>
              <p className={`text-sm font-medium mt-1 ${isDark ? "text-neutral-200" : "text-stone-700"}`}>{p.title}</p>
              <p className={`text-xs mt-1 ${isDark ? "text-neutral-500" : "text-stone-400"}`}>{p.description}</p>
            </div>
            <div className="flex gap-1 shrink-0">
              <button onClick={() => handleEdit(p)} className={`cursor-pointer p-2 rounded-lg transition-all ${isDark ? "hover:bg-white/5 text-neutral-500" : "hover:bg-stone-100 text-stone-400"}`}><Pencil className="w-3.5 h-3.5" /></button>
              <button onClick={() => handleDelete(p.id)} className="cursor-pointer p-2 rounded-lg hover:bg-red-500/10 text-red-400 transition-all"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          </motion.div>
        ))}
      </div>
      {projects.length === 0 && <p className={`text-center text-sm italic py-8 ${isDark ? "text-neutral-600" : "text-stone-400"}`}>No projects yet.</p>}
    </div>
  );
}

const MATHOM_CATEGORIES = ["Prompts", "Lore", "Articles", "References"] as const;

function MathomsAdmin({ isDark }: { isDark: boolean }) {
  const [mathoms, setMathoms] = useState<MathomItem[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", content: "", category: "Prompts" as MathomItem["category"], tags: "", sourceUrl: "" });

  useEffect(() => { setMathoms(getMathoms()); }, []);

  function persist(updated: MathomItem[]) { setMathoms(updated); saveMathoms(updated); }
  function handleAdd() {
    if (!form.title.trim() || !form.content.trim()) return;
    persist([...mathoms, { id: `m_${Date.now()}`, title: form.title.trim(), content: form.content.trim(), category: form.category, date: new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "2-digit" }), tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean), sourceUrl: form.sourceUrl.trim() || undefined }]);
    setForm({ title: "", content: "", category: "Prompts", tags: "", sourceUrl: "" });
  }
  function handleDelete(id: string) { persist(mathoms.filter((m) => m.id !== id)); }
  function handleEdit(m: MathomItem) { setEditing(m.id); setForm({ title: m.title, content: m.content, category: m.category, tags: m.tags.join(", "), sourceUrl: m.sourceUrl || "" }); }
  function handleSaveEdit() {
    if (!editing) return;
    persist(mathoms.map((m) => m.id === editing ? { ...m, title: form.title.trim(), content: form.content.trim(), category: form.category, tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean), sourceUrl: form.sourceUrl.trim() || undefined } : m));
    setEditing(null); setForm({ title: "", content: "", category: "Prompts", tags: "", sourceUrl: "" });
  }
  function cancelEdit() { setEditing(null); setForm({ title: "", content: "", category: "Prompts", tags: "", sourceUrl: "" }); }

  const inputCls = `w-full px-3 py-2 rounded-lg text-sm outline-none transition-all ${isDark ? "bg-[#12100E] border border-neutral-800 focus:border-[#C5A059]/50 text-neutral-100 placeholder:text-neutral-600" : "bg-white border border-stone-200 focus:border-[#C5A059]/50 text-stone-800 placeholder:text-stone-400"}`;

  return (
    <div className="max-w-3xl mx-auto">
      <div className={`rounded-2xl p-5 mb-6 ${isDark ? "bg-[#12100E]/50 border border-white/5" : "bg-white border border-stone-200"}`}>
        <h3 className="text-sm font-bold mb-3 flex items-center gap-2"><Plus className="w-4 h-4 text-[#C5A059]" />{editing ? "Edit Mathom" : "Add New Mathom"}</h3>
        <div className="flex flex-col gap-2">
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Title" className={inputCls} />
          <textarea value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} placeholder="Content" rows={3} className={inputCls} />
          <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as MathomItem["category"] })} className={inputCls}>
            {MATHOM_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="Tags (comma-separated)" className={inputCls} />
          <input value={form.sourceUrl} onChange={(e) => setForm({ ...form, sourceUrl: e.target.value })} placeholder="Source URL (optional)" className={inputCls} />
          <div className="flex gap-2 mt-1">
            {editing && <button onClick={cancelEdit} className={`cursor-pointer px-4 py-2 rounded-lg text-xs font-medium ${isDark ? "bg-neutral-800 text-neutral-300" : "bg-stone-100 text-stone-600"}`}>Cancel</button>}
            <button onClick={editing ? handleSaveEdit : handleAdd} className="cursor-pointer px-4 py-2 rounded-lg text-xs font-bold bg-[#C5A059] hover:bg-[#b08c48] text-neutral-950 transition-all flex items-center gap-1.5">
              {editing ? <Save className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}{editing ? "Save Changes" : "Add Mathom"}
            </button>
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {mathoms.map((m) => (
          <motion.div key={m.id} layout initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className={`rounded-xl p-4 flex items-start justify-between gap-3 transition-all ${isDark ? "bg-[#12100E]/50 border border-white/5 hover:border-white/10" : "bg-white border border-stone-200 hover:border-stone-300"}`}>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-[#C5A059]/10 text-[#C5A059]">{m.category}</span>
                <span className={`text-[10px] ${isDark ? "text-neutral-600" : "text-stone-400"}`}>{m.date}</span>
              </div>
              <p className={`text-sm font-medium ${isDark ? "text-neutral-200" : "text-stone-700"}`}>{m.title}</p>
              <p className={`text-xs mt-1 line-clamp-2 ${isDark ? "text-neutral-500" : "text-stone-400"}`}>{m.content}</p>
            </div>
            <div className="flex gap-1 shrink-0">
              <button onClick={() => handleEdit(m)} className={`cursor-pointer p-2 rounded-lg transition-all ${isDark ? "hover:bg-white/5 text-neutral-500" : "hover:bg-stone-100 text-stone-400"}`}><Pencil className="w-3.5 h-3.5" /></button>
              <button onClick={() => handleDelete(m.id)} className="cursor-pointer p-2 rounded-lg hover:bg-red-500/10 text-red-400 transition-all"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          </motion.div>
        ))}
      </div>
      {mathoms.length === 0 && <p className={`text-center text-sm italic py-8 ${isDark ? "text-neutral-600" : "text-stone-400"}`}>No mathoms yet.</p>}
    </div>
  );
}

function SecretsAdmin({ isDark }: { isDark: boolean }) {
  const [secrets, setSecrets] = useState<SecretSpot[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", description: "", x: "50", y: "50", link: "", revealText: "" });

  useEffect(() => { setSecrets(getSecrets()); }, []);

  function persist(updated: SecretSpot[]) { setSecrets(updated); saveSecrets(updated); }
  function handleAdd() {
    if (!form.name.trim() || !form.description.trim()) return;
    persist([...secrets, { id: `s_${Date.now()}`, name: form.name.trim(), description: form.description.trim(), coordinates: { x: Number(form.x) || 50, y: Number(form.y) || 50 }, link: form.link.trim() || undefined, revealText: form.revealText.trim() }]);
    setForm({ name: "", description: "", x: "50", y: "50", link: "", revealText: "" });
  }
  function handleDelete(id: string) { persist(secrets.filter((s) => s.id !== id)); }
  function handleEdit(s: SecretSpot) { setEditing(s.id); setForm({ name: s.name, description: s.description, x: String(s.coordinates.x), y: String(s.coordinates.y), link: s.link || "", revealText: s.revealText }); }
  function handleSaveEdit() {
    if (!editing) return;
    persist(secrets.map((s) => s.id === editing ? { ...s, name: form.name.trim(), description: form.description.trim(), coordinates: { x: Number(form.x) || 50, y: Number(form.y) || 50 }, link: form.link.trim() || undefined, revealText: form.revealText.trim() } : s));
    setEditing(null); setForm({ name: "", description: "", x: "50", y: "50", link: "", revealText: "" });
  }
  function cancelEdit() { setEditing(null); setForm({ name: "", description: "", x: "50", y: "50", link: "", revealText: "" }); }

  const inputCls = `w-full px-3 py-2 rounded-lg text-sm outline-none transition-all ${isDark ? "bg-[#12100E] border border-neutral-800 focus:border-[#C5A059]/50 text-neutral-100 placeholder:text-neutral-600" : "bg-white border border-stone-200 focus:border-[#C5A059]/50 text-stone-800 placeholder:text-stone-400"}`;

  return (
    <div className="max-w-3xl mx-auto">
      <div className={`rounded-2xl p-5 mb-6 ${isDark ? "bg-[#12100E]/50 border border-white/5" : "bg-white border border-stone-200"}`}>
        <h3 className="text-sm font-bold mb-3 flex items-center gap-2"><Plus className="w-4 h-4 text-[#C5A059]" />{editing ? "Edit Secret Spot" : "Add New Secret Spot"}</h3>
        <div className="flex flex-col gap-2">
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Spot name" className={inputCls} />
          <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Description" rows={2} className={inputCls} />
          <div className="flex gap-2">
            <input value={form.x} onChange={(e) => setForm({ ...form, x: e.target.value })} placeholder="X (%)" type="number" min="0" max="100" className={inputCls} />
            <input value={form.y} onChange={(e) => setForm({ ...form, y: e.target.value })} placeholder="Y (%)" type="number" min="0" max="100" className={inputCls} />
          </div>
          <input value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })} placeholder="Link (optional)" className={inputCls} />
          <input value={form.revealText} onChange={(e) => setForm({ ...form, revealText: e.target.value })} placeholder="Reveal text" className={inputCls} />
          <div className="flex gap-2 mt-1">
            {editing && <button onClick={cancelEdit} className={`cursor-pointer px-4 py-2 rounded-lg text-xs font-medium ${isDark ? "bg-neutral-800 text-neutral-300" : "bg-stone-100 text-stone-600"}`}>Cancel</button>}
            <button onClick={editing ? handleSaveEdit : handleAdd} className="cursor-pointer px-4 py-2 rounded-lg text-xs font-bold bg-[#C5A059] hover:bg-[#b08c48] text-neutral-950 transition-all flex items-center gap-1.5">
              {editing ? <Save className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}{editing ? "Save Changes" : "Add Secret"}
            </button>
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {secrets.map((s) => (
          <motion.div key={s.id} layout initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className={`rounded-xl p-4 flex items-start justify-between gap-3 transition-all ${isDark ? "bg-[#12100E]/50 border border-white/5 hover:border-white/10" : "bg-white border border-stone-200 hover:border-stone-300"}`}>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium ${isDark ? "text-neutral-200" : "text-stone-700"}`}>{s.name}</p>
              <p className={`text-xs mt-1 ${isDark ? "text-neutral-500" : "text-stone-400"}`}>{s.description}</p>
              <p className={`text-[10px] font-mono mt-1 ${isDark ? "text-neutral-600" : "text-stone-400"}`}>Coords: ({s.coordinates.x}%, {s.coordinates.y}%)</p>
            </div>
            <div className="flex gap-1 shrink-0">
              <button onClick={() => handleEdit(s)} className={`cursor-pointer p-2 rounded-lg transition-all ${isDark ? "hover:bg-white/5 text-neutral-500" : "hover:bg-stone-100 text-stone-400"}`}><Pencil className="w-3.5 h-3.5" /></button>
              <button onClick={() => handleDelete(s.id)} className="cursor-pointer p-2 rounded-lg hover:bg-red-500/10 text-red-400 transition-all"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          </motion.div>
        ))}
      </div>
      {secrets.length === 0 && <p className={`text-center text-sm italic py-8 ${isDark ? "text-neutral-600" : "text-stone-400"}`}>No secret spots yet.</p>}
    </div>
  );
}
