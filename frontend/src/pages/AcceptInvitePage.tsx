import React, { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Mail,
  Users,
  Shield,
  ArrowRight,
  Loader2,
  LogIn,
  UserPlus,
} from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import type { InviteInfo } from "../types";

const INPUT_CLASS =
  "w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 py-3 text-sm text-gray-100 placeholder-gray-500 outline-none transition-all focus:border-[#00AFB9]/50 focus:ring-2 focus:ring-[#00AFB9]/20";

export function AcceptInvitePage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { user, login, register } = useAuth();
  const { toast } = useToast();

  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [mode, setMode] = useState<"login" | "register">("register");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");

  const fetchInvite = useCallback(async () => {
    try {
      const data = await api.get<InviteInfo>(`/invites/by-token/${token}`);
      setInvite(data);
      setEmail(data.email);
    } catch {
      toast("Invalid or expired invite link", "error");
    } finally {
      setLoading(false);
    }
  }, [token, toast]);

  useEffect(() => {
    fetchInvite();
  }, [fetchInvite]);

  const handleAcceptLoggedIn = useCallback(async () => {
    setAccepting(true);
    try {
      const result = await api.post<{ project_id: string }>("/invites/accept", {
        token,
      });
      toast("Invite accepted!", "success");
      navigate(`/projects/${result.project_id}`);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to accept invite";
      toast(message, "error");
    } finally {
      setAccepting(false);
    }
  }, [token, navigate, toast]);

  const handleLogin = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setAccepting(true);
      try {
        await login(email, password);
        // After login, accept the invite
        const result = await api.post<{ project_id: string }>(
          "/invites/accept",
          { token },
        );
        toast("Logged in and invite accepted!", "success");
        navigate(`/projects/${result.project_id}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Login failed";
        toast(message, "error");
      } finally {
        setAccepting(false);
      }
    },
    [email, password, token, login, navigate, toast],
  );

  const handleRegister = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setAccepting(true);
      try {
        const result = await api.post<{ access_token: string }>(
          "/invites/accept-register",
          {
            token,
            display_name: displayName,
            password,
          },
        );
        localStorage.setItem("bh-token", result.access_token);
        toast("Account created and invite accepted!", "success");
        navigate("/onboarding");
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Registration failed";
        toast(message, "error");
      } finally {
        setAccepting(false);
      }
    },
    [token, displayName, password, navigate, toast],
  );

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0f0d1a]">
        <Loader2 className="h-8 w-8 animate-spin text-[#00AFB9]" />
      </div>
    );
  }

  if (!invite || invite.is_expired) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0f0d1a]">
        <div className="text-center">
          <Shield className="mx-auto h-12 w-12 text-gray-500" />
          <h2 className="mt-4 text-xl font-semibold text-gray-100">
            Invite Expired
          </h2>
          <p className="mt-2 text-sm text-gray-400">
            This invite link is no longer valid.
          </p>
          <button
            onClick={() => navigate("/")}
            className="mt-6 rounded-lg bg-[#00AFB9] px-6 py-2.5 text-sm font-medium text-[#0f0d1a] transition-all hover:brightness-110"
          >
            Go to Codevv
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0f0d1a]">
      {/* Gradient orbs */}
      <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-[#00AFB9]/10 blur-[120px]" />
      <div className="pointer-events-none absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-[#F07167]/10 blur-[120px]" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative w-full max-w-md rounded-xl border border-white/[0.06] bg-white/[0.03] p-8 backdrop-blur-xl"
      >
        {/* Invite info header */}
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#00AFB9]/10">
            <Users className="h-6 w-6 text-[#00AFB9]" />
          </div>
          <h1 className="text-xl font-semibold text-gray-100">
            You're invited!
          </h1>
          <p className="mt-1 text-sm text-gray-400">
            <span className="text-gray-200">{invite.inviter_name}</span> invited
            you to join{" "}
            <span className="font-medium text-[#00AFB9]">
              {invite.project_name}
            </span>{" "}
            as <span className="capitalize text-gray-200">{invite.role}</span>
          </p>
        </div>

        {user ? (
          /* Already logged in — just accept */
          <div className="space-y-4">
            <div className="rounded-lg bg-white/[0.03] p-4">
              <p className="text-sm text-gray-400">Logged in as</p>
              <p className="font-medium text-gray-100">{user.email}</p>
            </div>
            <button
              onClick={handleAcceptLoggedIn}
              disabled={accepting}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#00AFB9] px-4 py-3 text-sm font-medium text-[#0f0d1a] transition-all hover:brightness-110 disabled:opacity-50"
            >
              {accepting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowRight className="h-4 w-4" />
              )}
              Accept Invite
            </button>
          </div>
        ) : (
          /* Not logged in — show login/register tabs */
          <div>
            <div className="mb-6 flex rounded-lg bg-white/[0.03] p-1">
              <button
                onClick={() => setMode("register")}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-2 text-sm font-medium transition-all ${
                  mode === "register"
                    ? "bg-[#00AFB9]/10 text-[#00AFB9]"
                    : "text-gray-400 hover:text-gray-200"
                }`}
              >
                <UserPlus className="h-3.5 w-3.5" /> Register
              </button>
              <button
                onClick={() => setMode("login")}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-2 text-sm font-medium transition-all ${
                  mode === "login"
                    ? "bg-[#00AFB9]/10 text-[#00AFB9]"
                    : "text-gray-400 hover:text-gray-200"
                }`}
              >
                <LogIn className="h-3.5 w-3.5" /> Login
              </button>
            </div>

            {mode === "register" ? (
              <form onSubmit={handleRegister} className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400">
                    Email
                  </label>
                  <div className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 py-3">
                    <Mail className="h-4 w-4 text-gray-500" />
                    <span className="text-sm text-gray-300">
                      {invite.email}
                    </span>
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400">
                    Display Name
                  </label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Your name"
                    required
                    className={INPUT_CLASS}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400">
                    Password
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
                <button
                  type="submit"
                  disabled={accepting}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#00AFB9] px-4 py-3 text-sm font-medium text-[#0f0d1a] transition-all hover:brightness-110 disabled:opacity-50"
                >
                  {accepting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ArrowRight className="h-4 w-4" />
                  )}
                  Create Account & Join
                </button>
              </form>
            ) : (
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400">
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    required
                    className={INPUT_CLASS}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400">
                    Password
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Your password"
                    required
                    className={INPUT_CLASS}
                  />
                </div>
                <button
                  type="submit"
                  disabled={accepting}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#00AFB9] px-4 py-3 text-sm font-medium text-[#0f0d1a] transition-all hover:brightness-110 disabled:opacity-50"
                >
                  {accepting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <LogIn className="h-4 w-4" />
                  )}
                  Login & Join
                </button>
              </form>
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
}
