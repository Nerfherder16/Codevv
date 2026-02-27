import React, { useState, useCallback } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  KeyRound,
  Mail,
  ArrowRight,
  Loader2,
  CheckCircle,
  ArrowLeft,
} from "lucide-react";
import { api } from "../lib/api";
import { useToast } from "../contexts/ToastContext";

const INPUT_CLASS =
  "w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 py-3 text-sm text-gray-100 placeholder-gray-500 outline-none transition-all focus:border-[#00AFB9]/50 focus:ring-2 focus:ring-[#00AFB9]/20";

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const token = searchParams.get("token");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [reset, setReset] = useState(false);

  const handleRequestReset = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setLoading(true);
      try {
        await api.post("/auth/forgot-password", { email });
        setSent(true);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to send reset email";
        toast(message, "error");
      } finally {
        setLoading(false);
      }
    },
    [email, toast],
  );

  const handleResetPassword = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (password !== confirmPassword) {
        toast("Passwords don't match", "error");
        return;
      }
      setLoading(true);
      try {
        await api.post("/auth/reset-password", {
          token,
          new_password: password,
        });
        setReset(true);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to reset password";
        toast(message, "error");
      } finally {
        setLoading(false);
      }
    },
    [token, password, confirmPassword, toast],
  );

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0f0d1a]">
      <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-[#00AFB9]/10 blur-[120px]" />
      <div className="pointer-events-none absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-[#F07167]/10 blur-[120px]" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative w-full max-w-md rounded-xl border border-white/[0.06] bg-white/[0.03] p-8 backdrop-blur-xl"
      >
        {!token && !sent && (
          <>
            <div className="mb-6 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#00AFB9]/10">
                <Mail className="h-6 w-6 text-[#00AFB9]" />
              </div>
              <h1 className="text-xl font-semibold text-gray-100">
                Reset your password
              </h1>
              <p className="mt-1 text-sm text-gray-400">
                Enter your email and we'll send you a reset link.
              </p>
            </div>
            <form onSubmit={handleRequestReset} className="space-y-4">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                className={INPUT_CLASS}
              />
              <button
                type="submit"
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#00AFB9] px-4 py-3 text-sm font-medium text-[#0f0d1a] transition-all hover:brightness-110 disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ArrowRight className="h-4 w-4" />
                )}
                Send Reset Link
              </button>
            </form>
            <Link
              to="/"
              className="mt-4 flex items-center justify-center gap-1 text-sm text-gray-400 hover:text-gray-200"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back to login
            </Link>
          </>
        )}

        {!token && sent && (
          <div className="text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10">
              <CheckCircle className="h-6 w-6 text-emerald-400" />
            </div>
            <h2 className="text-xl font-semibold text-gray-100">
              Check your email
            </h2>
            <p className="mt-2 text-sm text-gray-400">
              If an account exists for{" "}
              <span className="text-gray-200">{email}</span>, we've sent a
              password reset link.
            </p>
            <Link
              to="/"
              className="mt-6 inline-flex items-center gap-1 text-sm text-[#00AFB9] hover:underline"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back to login
            </Link>
          </div>
        )}

        {token && !reset && (
          <>
            <div className="mb-6 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#00AFB9]/10">
                <KeyRound className="h-6 w-6 text-[#00AFB9]" />
              </div>
              <h1 className="text-xl font-semibold text-gray-100">
                Set a new password
              </h1>
              <p className="mt-1 text-sm text-gray-400">
                Enter your new password below.
              </p>
            </div>
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400">
                  New Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min 6 characters"
                  required
                  minLength={6}
                  className={INPUT_CLASS}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400">
                  Confirm Password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm your password"
                  required
                  minLength={6}
                  className={INPUT_CLASS}
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#00AFB9] px-4 py-3 text-sm font-medium text-[#0f0d1a] transition-all hover:brightness-110 disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ArrowRight className="h-4 w-4" />
                )}
                Reset Password
              </button>
            </form>
          </>
        )}

        {token && reset && (
          <div className="text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10">
              <CheckCircle className="h-6 w-6 text-emerald-400" />
            </div>
            <h2 className="text-xl font-semibold text-gray-100">
              Password reset!
            </h2>
            <p className="mt-2 text-sm text-gray-400">
              Your password has been updated. You can now log in.
            </p>
            <button
              onClick={() => navigate("/")}
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-[#00AFB9] px-6 py-2.5 text-sm font-medium text-[#0f0d1a] transition-all hover:brightness-110"
            >
              Go to Login <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}
