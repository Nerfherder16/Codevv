import React, { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "react-router-dom";
import {
  Terminal,
  Play,
  Square,
  Plus,
  Eye,
  Users,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { api } from "../lib/api";
import { SharedTerminal } from "../components/workspace/SharedTerminal";
import type { Workspace, TerminalSession, WorkspaceScope } from "../types";

export function WorkspacePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [terminals, setTerminals] = useState<TerminalSession[]>([]);
  const [activeTerminal, setActiveTerminal] = useState<TerminalSession | null>(
    null,
  );
  const [scope, setScope] = useState<WorkspaceScope>("project");
  const [loading, setLoading] = useState(true);
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const token = localStorage.getItem("bh-token") || "";
  const currentUserId = ""; // filled by context in real app

  const basePath = `/api/projects/${projectId}/workspaces`;

  const fetchWorkspaces = useCallback(async () => {
    try {
      const list = await api.get<Workspace[]>(
        `/projects/${projectId}/workspaces`,
      );
      const active = list.find(
        (w) => w.status === "running" || w.status === "starting",
      );
      setWorkspace(active || null);
      if (active && active.status === "running") {
        const sessions = await api.get<TerminalSession[]>(
          `/projects/${projectId}/workspaces/${active.id}/terminals`,
        );
        setTerminals(sessions);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchWorkspaces();
  }, [fetchWorkspaces]);

  // Poll while starting
  useEffect(() => {
    if (workspace?.status === "starting") {
      pollRef.current = setInterval(async () => {
        try {
          const w = await api.get<Workspace>(
            `/projects/${projectId}/workspaces/${workspace.id}`,
          );
          setWorkspace(w);
          if (w.status === "running") {
            if (pollRef.current) clearInterval(pollRef.current);
            const sessions = await api.get<TerminalSession[]>(
              `/projects/${projectId}/workspaces/${w.id}/terminals`,
            );
            setTerminals(sessions);
          }
        } catch {
          // ignore polling errors
        }
      }, 3000);
      return () => {
        if (pollRef.current) clearInterval(pollRef.current);
      };
    }
  }, [workspace?.status, workspace?.id, projectId]);

  // Heartbeat while running
  useEffect(() => {
    if (workspace?.status === "running") {
      const sendHeartbeat = () => {
        if (document.visibilityState === "visible") {
          api
            .post(`/projects/${projectId}/workspaces/${workspace.id}/heartbeat`)
            .catch(() => {});
        }
      };
      heartbeatRef.current = setInterval(sendHeartbeat, 30000);
      return () => {
        if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      };
    }
  }, [workspace?.status, workspace?.id, projectId]);

  const handleLaunch = async () => {
    setLaunching(true);
    setError(null);
    try {
      const w = await api.post<Workspace>(`/projects/${projectId}/workspaces`, {
        project_id: projectId,
        scope,
      });
      setWorkspace(w);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to launch";
      setError(msg);
    } finally {
      setLaunching(false);
    }
  };

  const handleStop = async () => {
    if (!workspace) return;
    try {
      await api.delete(`/projects/${projectId}/workspaces/${workspace.id}`);
      setWorkspace(null);
      setTerminals([]);
      setActiveTerminal(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to stop";
      setError(msg);
    }
  };

  const handleNewTerminal = async () => {
    if (!workspace) return;
    try {
      const session = await api.post<TerminalSession>(
        `/projects/${projectId}/workspaces/${workspace.id}/terminals`,
        { workspace_id: workspace.id },
      );
      setTerminals((prev) => [session, ...prev]);
      setActiveTerminal(session);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create";
      setError(msg);
    }
  };

  const handleToggleMode = async (session: TerminalSession) => {
    if (!workspace) return;
    const newMode =
      session.mode === "collaborative" ? "readonly" : "collaborative";
    try {
      const updated = await api.patch<TerminalSession>(
        `/projects/${projectId}/workspaces/${workspace.id}/terminals/${session.id}`,
        { mode: newMode },
      );
      setTerminals((prev) =>
        prev.map((t) => (t.id === updated.id ? updated : t)),
      );
      if (activeTerminal?.id === updated.id) setActiveTerminal(updated);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to update";
      setError(msg);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-6 h-6 animate-spin text-teal-400" />
      </div>
    );
  }

  // No active workspace — show launch UI
  if (!workspace) {
    return (
      <div className="max-w-lg mx-auto mt-24 text-center">
        <div className="w-16 h-16 mx-auto mb-6 rounded-xl bg-teal-500/10 flex items-center justify-center">
          <Terminal className="w-8 h-8 text-teal-400" />
        </div>
        <h2 className="text-2xl font-semibold text-gray-100 mb-2">
          Code Workspace
        </h2>
        <p className="text-sm text-gray-400 mb-8">
          Launch a cloud code editor with a shared terminal for real-time
          collaboration.
        </p>

        {error && (
          <div className="flex items-center gap-2 mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        <div className="flex items-center justify-center gap-3 mb-6">
          <label className="text-xs text-gray-500 uppercase tracking-wide">
            Scope
          </label>
          {(["project", "user", "global"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setScope(s)}
              className={`px-3 py-1.5 text-xs rounded-full transition-colors ${
                scope === s
                  ? "bg-teal-500/20 text-teal-300 border border-teal-500/30"
                  : "text-gray-400 hover:bg-white/5 border border-white/5"
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        <button
          onClick={handleLaunch}
          disabled={launching}
          className="inline-flex items-center gap-2 px-6 py-2.5 bg-teal-500 hover:bg-teal-400 text-gray-950 font-medium rounded-lg transition-colors disabled:opacity-50"
        >
          {launching ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Play className="w-4 h-4" />
          )}
          Launch Workspace
        </button>
      </div>
    );
  }

  // Starting state
  if (workspace.status === "starting") {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <Loader2 className="w-8 h-8 animate-spin text-teal-400" />
        <p className="text-sm text-gray-400">Starting workspace container...</p>
        <p className="text-xs text-gray-600">
          This usually takes 10-30 seconds
        </p>
      </div>
    );
  }

  // Running — show iframe + terminal panel
  const iframeUrl = `http://${window.location.hostname}:${workspace.port}/?folder=/config/workspace`;

  return (
    <div className="flex flex-col h-[calc(100vh-5rem)] gap-0">
      {error && (
        <div className="flex items-center gap-2 mx-1 mb-1 p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 text-xs">
          <AlertCircle className="w-3 h-3 shrink-0" />
          {error}
        </div>
      )}

      {/* Top bar */}
      <div className="flex items-center gap-3 px-3 py-2 bg-[#1e1b2e] border-b border-white/5 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs text-gray-300 font-medium">
            Port {workspace.port}
          </span>
        </div>
        <div className="flex-1" />
        <button
          onClick={handleNewTerminal}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs text-gray-300 hover:bg-white/5 rounded-md transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Terminal
        </button>
        <button
          onClick={handleStop}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs text-red-400 hover:bg-red-500/10 rounded-md transition-colors"
        >
          <Square className="w-3.5 h-3.5" />
          Stop
        </button>
      </div>

      {/* Main content: iframe + optional terminal sidebar */}
      <div className="flex flex-1 min-h-0">
        {/* Code editor iframe */}
        <div className="flex-1 min-w-0">
          <iframe
            src={iframeUrl}
            className="w-full h-full border-none bg-[#0f0d1a]"
            title="Code Editor"
            allow="clipboard-read; clipboard-write"
          />
        </div>

        {/* Terminal sidebar */}
        {terminals.length > 0 && (
          <div className="w-80 border-l border-white/5 flex flex-col bg-[#13111c]">
            {/* Session list */}
            <div className="p-2 border-b border-white/5 space-y-1 max-h-32 overflow-y-auto">
              {terminals.map((t) => (
                <div
                  key={t.id}
                  className={`flex items-center gap-2 px-2 py-1 rounded cursor-pointer text-xs transition-colors ${
                    activeTerminal?.id === t.id
                      ? "bg-teal-500/10 text-teal-300"
                      : "text-gray-400 hover:bg-white/5"
                  }`}
                >
                  <button
                    onClick={() => setActiveTerminal(t)}
                    className="flex-1 text-left font-mono truncate"
                  >
                    {t.tmux_session}
                  </button>
                  <button
                    onClick={() => handleToggleMode(t)}
                    title={
                      t.mode === "collaborative"
                        ? "Switch to read-only"
                        : "Switch to collaborative"
                    }
                    className="p-0.5 hover:bg-white/10 rounded"
                  >
                    {t.mode === "collaborative" ? (
                      <Users className="w-3 h-3" />
                    ) : (
                      <Eye className="w-3 h-3" />
                    )}
                  </button>
                </div>
              ))}
            </div>

            {/* Active terminal */}
            {activeTerminal && (
              <div className="flex-1 min-h-0">
                <SharedTerminal
                  key={activeTerminal.id + activeTerminal.mode}
                  session={activeTerminal}
                  token={token}
                  currentUserId={currentUserId}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
