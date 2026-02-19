import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, User, Mail, Lock } from "lucide-react";

import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "../../contexts/ToastContext";

const ease = [0.16, 1, 0.3, 1] as const;

const INPUT_CLASS =
  "w-full pl-11 pr-4 py-3.5 rounded-xl bg-white/[0.03] border border-white/[0.06] text-white placeholder-gray-600 text-sm focus:border-teal/50 focus:bg-white/[0.05] focus:ring-2 focus:ring-teal/10 transition-all duration-200 outline-none";

const LABEL_CLASS =
  "block text-[11px] font-medium text-gray-500 uppercase tracking-[0.15em] mb-2.5";

export function LoginPage() {
  const { login, register } = useAuth();
  const { toast } = useToast();

  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      toast("Please fill in all required fields.", "error");
      return;
    }
    if (mode === "register" && !displayName.trim()) {
      toast("Display name is required.", "error");
      return;
    }
    if (password.length < 6) {
      toast("Password must be at least 6 characters.", "error");
      return;
    }
    setLoading(true);
    try {
      if (mode === "login") {
        await login(email.trim(), password);
        toast("Welcome back!", "success");
      } else {
        await register(email.trim(), password, displayName.trim());
        toast("Account created successfully!", "success");
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Something went wrong";
      toast(message, "error");
    } finally {
      setLoading(false);
    }
  };

  const toggleMode = () => {
    setMode((prev) => (prev === "login" ? "register" : "login"));
    setDisplayName("");
  };

  return (
    <div className="min-h-screen flex bg-black">
      {/* ───── LEFT: Branding Panel ───── */}
      <div className="hidden lg:flex lg:w-[55%] relative overflow-hidden">
        {/* Animated gradient orbs */}
        <motion.div
          className="absolute w-[600px] h-[600px] rounded-full blur-[120px] opacity-20"
          style={{ background: "#00AFB9", top: "10%", left: "20%" }}
          animate={{ x: [0, 60, 0], y: [0, -40, 0] }}
          transition={{ repeat: Infinity, duration: 10, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute w-[500px] h-[500px] rounded-full blur-[120px] opacity-[0.12]"
          style={{ background: "#F07167", bottom: "10%", right: "10%" }}
          animate={{ x: [0, -50, 0], y: [0, 30, 0] }}
          transition={{ repeat: Infinity, duration: 12, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute w-[300px] h-[300px] rounded-full blur-[100px] opacity-10"
          style={{ background: "#00AFB9", top: "60%", left: "50%" }}
          animate={{ x: [0, 40, 0], y: [0, -60, 0] }}
          transition={{ repeat: Infinity, duration: 14, ease: "easeInOut" }}
        />

        {/* Grid texture */}
        <div className="absolute inset-0 bg-grid opacity-[0.15]" />

        {/* Right border gradient */}
        <div className="absolute right-0 top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-white/10 to-transparent" />

        {/* Content */}
        <div className="relative z-10 flex flex-col justify-between p-12 xl:p-16 2xl:p-20 w-full">
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <img
              src="/codevvicon.png"
              alt=""
              className="w-10 h-10 opacity-80"
            />
          </motion.div>

          <div>
            <motion.h1
              className="text-[clamp(3rem,5vw,5rem)] font-black text-white leading-[0.95] tracking-[-0.03em]"
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.9, ease }}
            >
              Where ideas
              <br />
              become
              <br />
              <span className="gradient-text">infrastructure.</span>
            </motion.h1>

            <motion.p
              className="text-base xl:text-lg text-gray-500 mt-8 max-w-md leading-relaxed font-light"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.9, delay: 0.15, ease }}
            >
              Plan, design, and deploy your software architecture with AI that
              understands your codebase.
            </motion.p>
          </div>

          <motion.div
            className="flex flex-wrap gap-3"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5, duration: 0.8 }}
          >
            {["AI Architecture", "Real-time Collab", "One-Click Deploy"].map(
              (label) => (
                <span
                  key={label}
                  className="px-4 py-2 rounded-full text-xs font-medium text-gray-400 border border-white/[0.06] bg-white/[0.02]"
                >
                  {label}
                </span>
              ),
            )}
          </motion.div>
        </div>

        {/* Floating shapes */}
        <motion.div
          className="absolute top-[20%] right-16 w-48 h-48 xl:w-64 xl:h-64 rounded-3xl border border-white/[0.04]"
          animate={{ y: [0, -24, 0], rotate: [0, 2, 0] }}
          transition={{ repeat: Infinity, duration: 7, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute bottom-[25%] right-32 w-32 h-32 rounded-2xl border border-white/[0.03]"
          animate={{ y: [0, 18, 0], rotate: [0, -1.5, 0] }}
          transition={{ repeat: Infinity, duration: 9, ease: "easeInOut" }}
        />
      </div>

      {/* ───── RIGHT: Form Panel ───── */}
      <div className="w-full lg:w-[45%] flex items-center justify-center relative px-6 sm:px-12">
        {/* Mobile gradient orbs */}
        <div className="lg:hidden absolute inset-0 overflow-hidden pointer-events-none">
          <div
            className="absolute w-[400px] h-[400px] rounded-full blur-[100px] opacity-15"
            style={{ background: "#00AFB9", top: "-10%", right: "-20%" }}
          />
          <div
            className="absolute w-[350px] h-[350px] rounded-full blur-[100px] opacity-10"
            style={{ background: "#F07167", bottom: "-10%", left: "-20%" }}
          />
        </div>

        <motion.div
          className="w-full max-w-[360px] relative z-10"
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7, delay: 0.2, ease }}
        >
          {/* Mobile logo */}
          <div className="lg:hidden mb-12 text-center">
            <img src="/codevvlogo.png" alt="Codevv" className="w-28 mx-auto" />
          </div>

          {/* Heading with animated swap */}
          <div className="mb-10">
            <AnimatePresence mode="wait">
              <motion.div
                key={mode}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.25 }}
              >
                <h2 className="text-3xl font-black text-white tracking-[-0.02em]">
                  {mode === "login" ? "Welcome back" : "Get started"}
                </h2>
                <p className="text-gray-600 mt-3 text-sm">
                  {mode === "login"
                    ? "Sign in to continue to Codevv"
                    : "Create your Codevv account"}
                </p>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <AnimatePresence mode="popLayout">
              {mode === "register" && (
                <motion.div
                  key="name-field"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.3, ease }}
                  className="overflow-hidden"
                >
                  <div className="pb-5">
                    <label htmlFor="displayName" className={LABEL_CLASS}>
                      Name
                    </label>
                    <div className="relative">
                      <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
                      <input
                        id="displayName"
                        type="text"
                        autoComplete="name"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder="Your name"
                        className={INPUT_CLASS}
                      />
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div>
              <label htmlFor="email" className={LABEL_CLASS}>
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className={INPUT_CLASS}
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className={LABEL_CLASS}>
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
                <input
                  id="password"
                  type="password"
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className={INPUT_CLASS}
                />
              </div>
            </div>

            <div className="pt-2">
              <motion.button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 rounded-xl btn-glow text-white font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                whileHover={{ scale: 1.015 }}
                whileTap={{ scale: 0.985 }}
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    {mode === "login" ? "Sign In" : "Create Account"}
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </motion.button>
            </div>
          </form>

          {/* Mode toggle */}
          <div className="mt-8 text-center">
            <span className="text-sm text-gray-600">
              {mode === "login"
                ? "Don\u2019t have an account?"
                : "Already have an account?"}
            </span>
            <button
              type="button"
              onClick={toggleMode}
              className="text-sm text-teal hover:text-teal/80 font-medium ml-1.5 transition-colors"
            >
              {mode === "login" ? "Create one" : "Sign in"}
            </button>
          </div>

          {/* Bottom mark */}
          <div className="mt-10 flex items-center gap-4">
            <div className="h-px flex-1 bg-white/[0.04]" />
            <span className="text-[10px] text-gray-700 uppercase tracking-[0.2em]">
              Codevv
            </span>
            <div className="h-px flex-1 bg-white/[0.04]" />
          </div>
        </motion.div>
      </div>
    </div>
  );
}
