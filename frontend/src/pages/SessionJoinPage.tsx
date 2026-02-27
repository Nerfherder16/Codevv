import React, { useEffect, useState } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { Loader2, AlertCircle } from "lucide-react";

const API_BASE = "/api";

export function SessionJoinPage() {
  const { code } = useParams<{ code: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const mode = searchParams.get("mode") || "collaborate";

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!code) return;

    const resolve = async () => {
      try {
        const token = localStorage.getItem("bh-token");
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (token) headers["Authorization"] = `Bearer ${token}`;

        const res = await fetch(`${API_BASE}/sessions/join/${code}?mode=${mode}`, { headers });

        if (res.status === 401) {
          const returnUrl = encodeURIComponent(window.location.pathname + window.location.search);
          navigate(`/login?next=${returnUrl}`, { replace: true });
          return;
        }

        if (!res.ok) {
          const data = await res.json().catch(() => ({ detail: "Session not found" }));
          setError(data.detail || "Session not found or has ended");
          return;
        }

        const data = await res.json();
        navigate(data.redirect, { replace: true });
      } catch {
        setError("Failed to connect. Please check your connection and try again.");
      }
    };

    resolve();
  }, [code, mode, navigate]);

  if (error) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center max-w-sm mx-4">
          <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-6 h-6 text-red-400" />
          </div>
          <h1 className="text-lg font-semibold text-white mb-2">Session Not Found</h1>
          <p className="text-sm text-gray-400 mb-6">{error}</p>
          <button
            onClick={() => navigate("/projects")}
            className="px-4 py-2 rounded-lg bg-white/[0.06] text-sm text-gray-200 hover:bg-white/[0.10] transition-colors"
          >
            Go to Projects
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="text-center">
        <Loader2 className="w-8 h-8 text-teal-400 animate-spin mx-auto mb-4" />
        <p className="text-sm text-gray-400">Joining session <span className="font-mono text-gray-300">{code}</span>...</p>
      </div>
    </div>
  );
}
