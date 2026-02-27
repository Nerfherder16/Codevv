import React, { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  Building2,
  UserPlus,
  Loader2,
  CheckCircle,
  XCircle,
} from "lucide-react";
import { api } from "../lib/api";
import type { OrgInviteDetail } from "../types";
import { useAuth } from "../contexts/AuthContext";

export function InviteAcceptPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { user, fetchUserOrgs } = useAuth();

  const [invite, setInvite] = useState<OrgInviteDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    if (!token) return;
    api.orgs
      .getInvite(token)
      .then(setInvite)
      .catch((err) =>
        setError(
          err instanceof Error ? err.message : "Invite not found or expired",
        ),
      )
      .finally(() => setLoading(false));
  }, [token]);

  const handleAccept = async () => {
    if (!token) return;
    setAccepting(true);
    try {
      await api.orgs.acceptInvite(token);
      await fetchUserOrgs();
      setAccepted(true);
      setTimeout(() => navigate("/projects"), 1800);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to accept invite");
    } finally {
      setAccepting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0f0d1a] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8">
          <img src="/codevvrevlogo.png" alt="Codevv" className="h-10 w-auto" />
        </div>

        <div className="rounded-2xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.03] p-8 shadow-xl">
          {loading ? (
            <div className="flex flex-col items-center gap-4 py-8">
              <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
              <p className="text-gray-500 dark:text-gray-400 text-sm">
                Loading invite...
              </p>
            </div>
          ) : accepted ? (
            <div className="flex flex-col items-center gap-4 py-8">
              <CheckCircle className="w-12 h-12 text-emerald-400" />
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                You're in!
              </h2>
              <p className="text-gray-500 dark:text-gray-400 text-sm text-center">
                You've joined <strong>{invite?.org_name}</strong>.
                Redirecting...
              </p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center gap-4 py-8">
              <XCircle className="w-12 h-12 text-red-400" />
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                Invite unavailable
              </h2>
              <p className="text-gray-500 dark:text-gray-400 text-sm text-center">
                {error}
              </p>
              <Link
                to="/projects"
                className="text-cyan-400 text-sm hover:underline"
              >
                Go to projects
              </Link>
            </div>
          ) : invite ? (
            <>
              <div className="flex justify-center mb-6">
                <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
                  <Building2 className="w-8 h-8 text-cyan-400" />
                </div>
              </div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 text-center mb-1">
                You're invited to join
              </h2>
              <p className="text-2xl font-bold text-cyan-400 text-center mb-4">
                {invite.org_name}
              </p>
              <div className="flex flex-col gap-1 items-center mb-6">
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  Role:{" "}
                  <span className="capitalize font-medium text-gray-700 dark:text-gray-300">
                    {invite.role}
                  </span>
                </span>
                {invite.invited_by_name && (
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    Invited by{" "}
                    <span className="font-medium text-gray-700 dark:text-gray-300">
                      {invite.invited_by_name}
                    </span>
                  </span>
                )}
              </div>
              {user ? (
                <button
                  onClick={handleAccept}
                  disabled={accepting}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-white font-medium py-3 transition-colors disabled:opacity-50"
                >
                  {accepting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <UserPlus className="w-4 h-4" />
                  )}
                  {accepting ? "Accepting..." : "Accept Invite"}
                </button>
              ) : (
                <div className="flex flex-col gap-3">
                  <p className="text-sm text-gray-500 dark:text-gray-400 text-center mb-1">
                    Sign in to accept this invite
                  </p>
                  <Link
                    to={`/?invite=${token}`}
                    className="w-full flex items-center justify-center rounded-xl bg-cyan-500 hover:bg-cyan-400 text-white font-medium py-3 transition-colors"
                  >
                    Sign In
                  </Link>
                  <Link
                    to={`/?invite=${token}&tab=register`}
                    className="w-full flex items-center justify-center rounded-xl border border-gray-200 dark:border-white/[0.10] text-gray-700 dark:text-gray-300 font-medium py-3 hover:bg-gray-50 dark:hover:bg-white/[0.05] transition-colors"
                  >
                    Create Account
                  </Link>
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
