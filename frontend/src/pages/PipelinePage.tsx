import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useParams } from "react-router-dom";
import {
  Workflow,
  Plus,
  Search,
  XCircle,
  ChevronRight,
  Clock,
  Loader2,
  CheckCircle2,
  Ban,
  AlertTriangle,
  Info,
  AlertCircle,
} from "lucide-react";
import { api } from "../lib/api";
import { useToast } from "../contexts/ToastContext";
import { Button } from "../components/common/Button";
import { Card } from "../components/common/Card";
import { PageHeader } from "../components/common/PageHeader";
import { PageLoading } from "../components/common/LoadingSpinner";
import { Modal } from "../components/common/Modal";
import { Input, Select } from "../components/common/Input";
import { EmptyState } from "../components/common/EmptyState";
import { relativeTime } from "../lib/utils";

type AgentType = "scaffold" | "feasibility" | "embedding" | "custom";
type RunStatus = "queued" | "running" | "completed" | "failed" | "cancelled";
type FindingSeverity = "info" | "warning" | "error" | "critical";

interface AgentRun {
  id: string;
  project_id: string;
  agent_type: AgentType;
  status: RunStatus;
  input_json: Record<string, unknown> | null;
  output_json: Record<string, unknown> | null;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_by: string;
  created_at: string;
  findings_count: number;
}

interface AgentFinding {
  id: string;
  run_id: string;
  severity: FindingSeverity;
  title: string;
  description: string | null;
  file_path: string | null;
  created_at: string;
}

interface AgentRunDetail extends AgentRun {
  findings: AgentFinding[];
}

const AGENT_TYPES: { label: string; value: AgentType | "" }[] = [
  { label: "All Types", value: "" },
  { label: "Scaffold", value: "scaffold" },
  { label: "Feasibility", value: "feasibility" },
  { label: "Embedding", value: "embedding" },
  { label: "Custom", value: "custom" },
];

const STATUS_OPTIONS: { label: string; value: RunStatus | "" }[] = [
  { label: "All Statuses", value: "" },
  { label: "Queued", value: "queued" },
  { label: "Running", value: "running" },
  { label: "Completed", value: "completed" },
  { label: "Failed", value: "failed" },
  { label: "Cancelled", value: "cancelled" },
];

const statusConfig: Record<
  RunStatus,
  { color: string; icon: React.ReactNode; label: string }
> = {
  queued: {
    color: "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400",
    icon: <Clock className="w-3.5 h-3.5" />,
    label: "Queued",
  },
  running: {
    color: "bg-teal/10 text-teal",
    icon: <Loader2 className="w-3.5 h-3.5 animate-spin" />,
    label: "Running",
  },
  completed: {
    color:
      "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300",
    icon: <CheckCircle2 className="w-3.5 h-3.5" />,
    label: "Completed",
  },
  failed: {
    color: "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300",
    icon: <XCircle className="w-3.5 h-3.5" />,
    label: "Failed",
  },
  cancelled: {
    color:
      "bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300",
    icon: <Ban className="w-3.5 h-3.5" />,
    label: "Cancelled",
  },
};

const agentTypeColors: Record<AgentType, string> = {
  scaffold:
    "bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300",
  feasibility:
    "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300",
  embedding:
    "bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300",
  custom: "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400",
};

const severityConfig: Record<
  FindingSeverity,
  { color: string; icon: React.ReactNode }
> = {
  info: {
    color: "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300",
    icon: <Info className="w-3.5 h-3.5" />,
  },
  warning: {
    color:
      "bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300",
    icon: <AlertTriangle className="w-3.5 h-3.5" />,
  },
  error: {
    color: "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300",
    icon: <AlertCircle className="w-3.5 h-3.5" />,
  },
  critical: {
    color: "bg-red-200 dark:bg-red-900/60 text-red-800 dark:text-red-200",
    icon: <AlertCircle className="w-3.5 h-3.5" />,
  },
};

export function PipelinePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { toast } = useToast();

  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<AgentType | "">("");
  const [filterStatus, setFilterStatus] = useState<RunStatus | "">("");

  // Modal state
  const [triggerOpen, setTriggerOpen] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [newAgentType, setNewAgentType] = useState<AgentType>("scaffold");
  const [newInputJson, setNewInputJson] = useState("");

  // Detail expansion
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AgentRunDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const fetchRuns = useCallback(async () => {
    if (!projectId) return;
    try {
      const params = new URLSearchParams();
      if (filterType) params.set("agent_type", filterType);
      if (filterStatus) params.set("status", filterStatus);
      const qs = params.toString();
      const url = `/projects/${projectId}/pipeline${qs ? `?${qs}` : ""}`;
      const data = await api.get<AgentRun[]>(url);
      setRuns(data);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load pipeline runs";
      toast(message, "error");
    } finally {
      setLoading(false);
    }
  }, [projectId, filterType, filterStatus, toast]);

  useEffect(() => {
    fetchRuns();
  }, [fetchRuns]);

  const handleExpand = useCallback(
    async (runId: string) => {
      if (expandedId === runId) {
        setExpandedId(null);
        setDetail(null);
        return;
      }
      setExpandedId(runId);
      setLoadingDetail(true);
      try {
        const data = await api.get<AgentRunDetail>(
          `/projects/${projectId}/pipeline/${runId}`,
        );
        setDetail(data);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to load run details";
        toast(message, "error");
      } finally {
        setLoadingDetail(false);
      }
    },
    [projectId, expandedId, toast],
  );

  const handleTrigger = async (e: React.FormEvent) => {
    e.preventDefault();
    let inputJson: Record<string, unknown> | null = null;
    if (newInputJson.trim()) {
      try {
        inputJson = JSON.parse(newInputJson.trim());
      } catch {
        toast("Invalid JSON input.", "error");
        return;
      }
    }

    setTriggering(true);
    try {
      const run = await api.post<AgentRun>(`/projects/${projectId}/pipeline`, {
        agent_type: newAgentType,
        input_json: inputJson,
      });
      toast("Pipeline run triggered!", "success");
      setTriggerOpen(false);
      setNewInputJson("");
      setRuns((prev) => [run, ...prev]);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to trigger run";
      toast(message, "error");
    } finally {
      setTriggering(false);
    }
  };

  const handleCancel = async (runId: string) => {
    try {
      await api.post(`/projects/${projectId}/pipeline/${runId}/cancel`, {});
      toast("Run cancelled.", "success");
      setRuns((prev) =>
        prev.map((r) =>
          r.id === runId ? { ...r, status: "cancelled" as RunStatus } : r,
        ),
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to cancel run";
      toast(message, "error");
    }
  };

  const closeTriggerModal = () => {
    setTriggerOpen(false);
    setNewAgentType("scaffold");
    setNewInputJson("");
  };

  if (loading) {
    return <PageLoading />;
  }

  return (
    <div>
      <PageHeader
        title="Pipeline"
        description="Run and monitor agent pipeline tasks."
        action={
          <Button onClick={() => setTriggerOpen(true)}>
            <Plus className="w-4 h-4" />
            Trigger Run
          </Button>
        }
      />

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <Select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value as AgentType | "")}
          className="sm:w-48"
        >
          {AGENT_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </Select>
        <Select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as RunStatus | "")}
          className="sm:w-48"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>
      </div>

      {/* Run list */}
      {runs.length === 0 ? (
        <EmptyState
          icon={<Workflow className="w-16 h-16" />}
          title="No pipeline runs"
          description="Trigger your first agent run to get started."
          actionLabel="Trigger Run"
          onAction={() => setTriggerOpen(true)}
        />
      ) : (
        <div className="space-y-3">
          {runs.map((run) => {
            const cfg = statusConfig[run.status];
            const isExpanded = expandedId === run.id;
            const isCancellable =
              run.status === "queued" || run.status === "running";

            return (
              <Card key={run.id} className="p-0 overflow-hidden">
                <div
                  onClick={() => handleExpand(run.id)}
                  className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <ChevronRight
                      className={`w-4 h-4 text-gray-400 shrink-0 transition-transform duration-200 ${
                        isExpanded ? "rotate-90" : ""
                      }`}
                    />
                    <span
                      className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${cfg.color}`}
                    >
                      {cfg.icon}
                      {cfg.label}
                    </span>
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${agentTypeColors[run.agent_type]}`}
                    >
                      {run.agent_type}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400 font-mono truncate">
                      {run.id.slice(0, 8)}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    {run.findings_count > 0 && (
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {run.findings_count} finding
                        {run.findings_count !== 1 ? "s" : ""}
                      </span>
                    )}
                    <span className="text-xs text-gray-400 dark:text-gray-500">
                      {relativeTime(run.created_at)}
                    </span>
                    {isCancellable && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCancel(run.id);
                        }}
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        Cancel
                      </Button>
                    )}
                  </div>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-gray-100 dark:border-gray-800">
                    {loadingDetail ? (
                      <div className="flex items-center gap-2 py-4 text-sm text-gray-500 dark:text-gray-400">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Loading details...
                      </div>
                    ) : detail ? (
                      <div className="pt-3 space-y-3">
                        {/* Timestamps */}
                        <div className="flex flex-wrap gap-4 text-xs text-gray-500 dark:text-gray-400">
                          {detail.started_at && (
                            <span>
                              Started: {relativeTime(detail.started_at)}
                            </span>
                          )}
                          {detail.completed_at && (
                            <span>
                              Completed: {relativeTime(detail.completed_at)}
                            </span>
                          )}
                          <span>By: {detail.created_by}</span>
                        </div>

                        {/* Error message */}
                        {detail.error_message && (
                          <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                            <p className="text-xs font-medium text-red-700 dark:text-red-300">
                              {detail.error_message}
                            </p>
                          </div>
                        )}

                        {/* Findings */}
                        {detail.findings.length > 0 && (
                          <div>
                            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                              Findings
                            </p>
                            <div className="space-y-2">
                              {detail.findings.map((finding) => {
                                const sev = severityConfig[finding.severity];
                                return (
                                  <div
                                    key={finding.id}
                                    className="flex items-start gap-2 p-2 rounded-lg bg-gray-50 dark:bg-gray-800/50"
                                  >
                                    <span
                                      className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full shrink-0 mt-0.5 ${sev.color}`}
                                    >
                                      {sev.icon}
                                      {finding.severity}
                                    </span>
                                    <div className="min-w-0">
                                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                                        {finding.title}
                                      </p>
                                      {finding.description && (
                                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                          {finding.description}
                                        </p>
                                      )}
                                      {finding.file_path && (
                                        <p className="text-xs text-gray-400 dark:text-gray-500 font-mono mt-0.5">
                                          {finding.file_path}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {detail.findings.length === 0 &&
                          !detail.error_message && (
                            <p className="text-sm text-gray-500 dark:text-gray-400 py-2">
                              No findings for this run.
                            </p>
                          )}
                      </div>
                    ) : null}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Trigger Run Modal */}
      <Modal open={triggerOpen} onClose={closeTriggerModal} title="Trigger Run">
        <form onSubmit={handleTrigger} className="space-y-4">
          <div>
            <label
              htmlFor="agentType"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Agent Type <span className="text-red-500">*</span>
            </label>
            <Select
              id="agentType"
              value={newAgentType}
              onChange={(e) => setNewAgentType(e.target.value as AgentType)}
            >
              <option value="scaffold">Scaffold</option>
              <option value="feasibility">Feasibility</option>
              <option value="embedding">Embedding</option>
              <option value="custom">Custom</option>
            </Select>
          </div>

          <div>
            <label
              htmlFor="inputJson"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Input JSON (optional)
            </label>
            <textarea
              id="inputJson"
              value={newInputJson}
              onChange={(e) => setNewInputJson(e.target.value)}
              placeholder='{"key": "value"}'
              rows={4}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/20 transition-colors resize-none font-mono"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={closeTriggerModal}>
              Cancel
            </Button>
            <Button type="submit" loading={triggering}>
              <Workflow className="w-4 h-4" />
              Trigger
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
