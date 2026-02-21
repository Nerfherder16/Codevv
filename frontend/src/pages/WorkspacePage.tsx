import React, { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "react-router-dom";
import { Terminal, Play, Square, Plus, Eye, Users } from "lucide-react";
import { api } from "../lib/api";
import { useToast } from "../contexts/ToastContext";
import { Button } from "../components/common/Button";
import { Card } from "../components/common/Card";
import { Badge } from "../components/common/Badge";
import { PageHeader } from "../components/common/PageHeader";
import { PageLoading } from "../components/common/LoadingSpinner";
import { EmptyState, CodeIllustration } from "../components/common/EmptyState";
import { SharedTerminal } from "../components/workspace/SharedTerminal";
import type { Workspace, TerminalSession, WorkspaceScope } from "../types";

export function WorkspacePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { toast } = useToast();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [terminals, setTerminals] = useState<TerminalSession[]>([]);
  const [activeTerminal, setActiveTerminal] = useState<TerminalSession | null>(
    null,
  );
  const [scope, setScope] = useState<WorkspaceScope>("project");
  const [loading, setLoading] = useState(true);
  const [launching, setLaunching] = useState(false);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const token = localStorage.getItem("bh-token") || "";
  const currentUserId = "";

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
      toast(msg, "error");
    } finally {
      setLoading(false);
    }
  }, [projectId, toast]);

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
    try {
      const w = await api.post<Workspace>(`/projects/${projectId}/workspaces`, {
        project_id: projectId,
        scope,
      });
      setWorkspace(w);
      toast("Workspace launching...", "success");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to launch";
      toast(msg, "error");
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
      toast("Workspace stopped.", "success");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to stop";
      toast(msg, "error");
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
      toast(msg, "error");
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
      toast(`Switched to ${newMode}`, "success");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to update";
      toast(msg, "error");
    }
  };

  if (loading) return <PageLoading />;

  // No active workspace — empty state with launch UI
  if (!workspace) {
    return (
      <div>
        <PageHeader
          title="Workspace"
          description="Launch a cloud code editor with shared terminals."
        />

        <EmptyState
          icon={<CodeIllustration />}
          title="No workspace running"
          description="Start a code-server instance with a shared terminal for real-time collaboration."
        />

        <div className="max-w-sm mx-auto mt-2 space-y-4">
          {/* Scope selector */}
          <div className="flex items-center justify-center gap-2">
            <span className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider font-medium">
              Scope
            </span>
            {(["project", "user", "global"] as const).map((s) => (
              <Badge
                key={s}
                variant={scope === s ? "teal" : "default"}
                size="md"
                className="cursor-pointer select-none"
              >
                <button onClick={() => setScope(s)} className="capitalize">
                  {s}
                </button>
              </Badge>
            ))}
          </div>

          <div className="flex justify-center">
            <Button onClick={handleLaunch} loading={launching}>
              <Play className="w-4 h-4" />
              Launch Workspace
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Starting state
  if (workspace.status === "starting") {
    return (
      <div>
        <PageHeader title="Workspace" description="Starting container..." />
        <div className="flex flex-col items-center justify-center h-64 gap-4">
          <PageLoading />
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Starting workspace container...
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500">
            This usually takes 10-30 seconds
          </p>
        </div>
      </div>
    );
  }

  // Running — code editor + terminal panel
  const iframeUrl = `http://${window.location.hostname}:${workspace.port}/?folder=/config/workspace`;

  return (
    <div className="flex flex-col h-[calc(100vh-5rem)]">
      {/* Header bar */}
      <div className="flex items-center justify-between mb-3 shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Workspace</h1>
          <Badge variant="success" size="md">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Port {workspace.port}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={handleNewTerminal}>
            <Plus className="w-4 h-4" />
            Terminal
          </Button>
          <Button variant="danger" size="sm" onClick={handleStop}>
            <Square className="w-4 h-4" />
            Stop
          </Button>
        </div>
      </div>

      {/* Main content: iframe + optional terminal sidebar */}
      <div className="flex flex-1 min-h-0 gap-3">
        {/* Code editor iframe */}
        <Card className="flex-1 min-w-0 p-0 overflow-hidden">
          <iframe
            src={iframeUrl}
            className="w-full h-full border-none"
            title="Code Editor"
            allow="clipboard-read; clipboard-write"
          />
        </Card>

        {/* Terminal sidebar */}
        {terminals.length > 0 && (
          <div className="w-80 flex flex-col gap-3">
            {/* Session list */}
            <Card className="p-3 space-y-1.5">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                Terminal Sessions
              </p>
              {terminals.map((t) => (
                <div
                  key={t.id}
                  className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                    activeTerminal?.id === t.id
                      ? "bg-teal/10 text-teal"
                      : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/[0.04]"
                  }`}
                >
                  <button
                    onClick={() => setActiveTerminal(t)}
                    className="flex-1 text-left font-mono truncate"
                  >
                    <Terminal className="w-3 h-3 inline mr-1.5" />
                    {t.tmux_session}
                  </button>
                  <Badge
                    variant={t.mode === "collaborative" ? "teal" : "default"}
                    size="sm"
                  >
                    {t.mode === "collaborative" ? "Collab" : "View"}
                  </Badge>
                  <button
                    onClick={() => handleToggleMode(t)}
                    title={
                      t.mode === "collaborative"
                        ? "Switch to read-only"
                        : "Switch to collaborative"
                    }
                    className="p-1 hover:bg-gray-200 dark:hover:bg-white/10 rounded transition-colors"
                  >
                    {t.mode === "collaborative" ? (
                      <Users className="w-3.5 h-3.5" />
                    ) : (
                      <Eye className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              ))}
            </Card>

            {/* Active terminal */}
            {activeTerminal && (
              <Card className="flex-1 min-h-0 p-0 overflow-hidden">
                <SharedTerminal
                  key={activeTerminal.id + activeTerminal.mode}
                  session={activeTerminal}
                  token={token}
                  currentUserId={currentUserId}
                />
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
