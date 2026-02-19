import React, { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import {
  Shield,
  Plus,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
} from "lucide-react";
import { api } from "../lib/api";
import { useToast } from "../contexts/ToastContext";
import { Button } from "../components/common/Button";
import { Card } from "../components/common/Card";
import { PageHeader } from "../components/common/PageHeader";
import { PageLoading } from "../components/common/LoadingSpinner";
import { Modal } from "../components/common/Modal";
import { Input, Select } from "../components/common/Input";
import { TextArea } from "../components/common/Input";
import { EmptyState } from "../components/common/EmptyState";

type CheckCategory =
  | "security"
  | "performance"
  | "legal"
  | "infrastructure"
  | "testing";
type CheckStatus =
  | "not_started"
  | "in_progress"
  | "passed"
  | "failed"
  | "waived";

interface ComplianceCheck {
  id: string;
  checklist_id: string;
  title: string;
  description: string | null;
  category: CheckCategory;
  status: CheckStatus;
  evidence_url: string | null;
  notes: string | null;
  assigned_to: string | null;
  updated_at: string;
  created_at: string;
}

interface ComplianceChecklist {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  created_by: string;
  created_at: string;
  checks_count: number;
  pass_rate: number;
}

interface ChecklistDetail extends ComplianceChecklist {
  checks: ComplianceCheck[];
}

interface LaunchReadiness {
  overall_score: number;
  category_scores: Record<string, number>;
  blockers: ComplianceCheck[];
  total: number;
  passed: number;
  failed: number;
}

const STATUS_COLORS: Record<CheckStatus, string> = {
  not_started: "bg-gray-500/10 text-gray-400 ring-1 ring-gray-500/20",
  in_progress: "bg-blue-500/10 text-blue-400 ring-1 ring-blue-500/20",
  passed: "bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20",
  failed: "bg-red-500/10 text-red-400 ring-1 ring-red-500/20",
  waived: "bg-yellow-500/10 text-yellow-400 ring-1 ring-yellow-500/20",
};

const STATUS_LABELS: Record<CheckStatus, string> = {
  not_started: "Not Started",
  in_progress: "In Progress",
  passed: "Passed",
  failed: "Failed",
  waived: "Waived",
};

const CATEGORY_COLORS: Record<CheckCategory, string> = {
  security: "bg-red-500/10 text-red-400 ring-1 ring-red-500/20",
  performance: "bg-blue-500/10 text-blue-400 ring-1 ring-blue-500/20",
  legal: "bg-violet-500/10 text-violet-400 ring-1 ring-violet-500/20",
  infrastructure: "bg-yellow-500/10 text-yellow-400 ring-1 ring-yellow-500/20",
  testing: "bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20",
};

const ALL_STATUSES: CheckStatus[] = [
  "not_started",
  "in_progress",
  "passed",
  "failed",
  "waived",
];
const ALL_CATEGORIES: CheckCategory[] = [
  "security",
  "performance",
  "legal",
  "infrastructure",
  "testing",
];

/* ---------- Checklist Accordion ---------- */

function ChecklistAccordion({
  checklist,
  projectId,
}: {
  checklist: ComplianceChecklist;
  projectId: string;
}) {
  const { toast } = useToast();
  const [isExpanded, setIsExpanded] = useState(false);
  const [checks, setChecks] = useState<ComplianceCheck[]>([]);
  const [loadingChecks, setLoadingChecks] = useState(false);
  const [addCheckOpen, setAddCheckOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newCategory, setNewCategory] = useState<CheckCategory>("security");
  const [adding, setAdding] = useState(false);

  const fetchChecks = useCallback(async () => {
    setLoadingChecks(true);
    try {
      const data = await api.get<ChecklistDetail>(
        `/projects/${projectId}/compliance/${checklist.id}`,
      );
      setChecks(data.checks);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load checks";
      toast(message, "error");
    } finally {
      setLoadingChecks(false);
    }
  }, [projectId, checklist.id, toast]);

  const handleToggle = () => {
    const next = !isExpanded;
    setIsExpanded(next);
    if (next && checks.length === 0) fetchChecks();
  };

  const handleStatusChange = async (checkId: string, status: CheckStatus) => {
    try {
      await api.patch(
        `/projects/${projectId}/compliance/${checklist.id}/checks/${checkId}`,
        {
          status,
        },
      );
      setChecks((prev) =>
        prev.map((c) => (c.id === checkId ? { ...c, status } : c)),
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to update status";
      toast(message, "error");
    }
  };

  const handleAddCheck = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) {
      toast("Check title is required.", "error");
      return;
    }
    setAdding(true);
    try {
      const check = await api.post<ComplianceCheck>(
        `/projects/${projectId}/compliance/${checklist.id}/checks`,
        {
          title: newTitle.trim(),
          description: newDesc.trim() || null,
          category: newCategory,
        },
      );
      setChecks((prev) => [...prev, check]);
      setAddCheckOpen(false);
      setNewTitle("");
      setNewDesc("");
      setNewCategory("security");
      toast("Check added!", "success");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to add check";
      toast(message, "error");
    } finally {
      setAdding(false);
    }
  };

  const passRate = checklist.pass_rate;

  return (
    <Card className="p-0 overflow-hidden">
      <button
        onClick={handleToggle}
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
      >
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 dark:text-white truncate">
            {checklist.name}
          </h3>
          {checklist.description && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
              {checklist.description}
            </p>
          )}
        </div>
        <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">
          {checklist.checks_count} checks
        </span>
        <div className="w-24 shrink-0">
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                style={{ width: `${passRate}%` }}
              />
            </div>
            <span className="text-xs font-medium text-gray-600 dark:text-gray-300 w-8 text-right">
              {Math.round(passRate)}%
            </span>
          </div>
        </div>
      </button>

      {isExpanded && (
        <div className="border-t border-gray-200 dark:border-gray-800 px-4 pb-4">
          {loadingChecks ? (
            <div className="flex justify-center py-6">
              <div className="w-5 h-5 border-2 border-teal border-t-transparent rounded-full animate-spin" />
            </div>
          ) : checks.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 py-4 text-center">
              No checks yet. Add one below.
            </p>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {checks.map((check) => (
                <div key={check.id} className="flex items-center gap-3 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {check.title}
                    </p>
                    {check.description && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {check.description}
                      </p>
                    )}
                  </div>
                  <span
                    className={`inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-full whitespace-nowrap ${CATEGORY_COLORS[check.category]}`}
                  >
                    {check.category}
                  </span>
                  <Select
                    value={check.status}
                    onChange={(e) =>
                      handleStatusChange(
                        check.id,
                        e.target.value as CheckStatus,
                      )
                    }
                    className="w-32 !py-1 !text-xs"
                  >
                    {ALL_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABELS[s]}
                      </option>
                    ))}
                  </Select>
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${
                      check.status === "passed"
                        ? "bg-emerald-500"
                        : check.status === "failed"
                          ? "bg-red-500"
                          : check.status === "in_progress"
                            ? "bg-blue-500"
                            : check.status === "waived"
                              ? "bg-yellow-500"
                              : "bg-gray-400"
                    }`}
                  />
                </div>
              ))}
            </div>
          )}

          {addCheckOpen ? (
            <form
              onSubmit={handleAddCheck}
              className="mt-3 space-y-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50"
            >
              <Input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Check title"
                autoFocus
              />
              <TextArea
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Description (optional)"
                rows={2}
              />
              <Select
                value={newCategory}
                onChange={(e) =>
                  setNewCategory(e.target.value as CheckCategory)
                }
              >
                {ALL_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c.charAt(0).toUpperCase() + c.slice(1)}
                  </option>
                ))}
              </Select>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setAddCheckOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" loading={adding}>
                  Add Check
                </Button>
              </div>
            </form>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="mt-3"
              onClick={() => setAddCheckOpen(true)}
            >
              <Plus className="w-3.5 h-3.5" />
              Add Check
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}

/* ---------- Main Page ---------- */

export function CompliancePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { toast } = useToast();

  const [checklists, setChecklists] = useState<ComplianceChecklist[]>([]);
  const [readiness, setReadiness] = useState<LaunchReadiness | null>(null);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [creating, setCreating] = useState(false);

  const fetchData = useCallback(async () => {
    if (!projectId) return;
    try {
      const [lists, ready] = await Promise.all([
        api.get<ComplianceChecklist[]>(`/projects/${projectId}/compliance`),
        api
          .get<LaunchReadiness>(`/projects/${projectId}/compliance/readiness`)
          .catch(() => null),
      ]);
      setChecklists(lists);
      setReadiness(ready);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load compliance data";
      toast(message, "error");
    } finally {
      setLoading(false);
    }
  }, [projectId, toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) {
      toast("Checklist name is required.", "error");
      return;
    }
    setCreating(true);
    try {
      const checklist = await api.post<ComplianceChecklist>(
        `/projects/${projectId}/compliance`,
        { name: newName.trim(), description: newDescription.trim() || null },
      );
      setChecklists((prev) => [checklist, ...prev]);
      setCreateOpen(false);
      setNewName("");
      setNewDescription("");
      toast("Checklist created!", "success");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to create checklist";
      toast(message, "error");
    } finally {
      setCreating(false);
    }
  };

  if (loading) return <PageLoading />;

  const score = readiness?.overall_score ?? 0;
  const blockers = readiness?.blockers ?? [];

  return (
    <div>
      <PageHeader
        title="Launch Readiness"
        description="Track compliance checks and launch blockers."
        action={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4" />
            Add Checklist
          </Button>
        }
      />

      {/* Readiness Score */}
      {readiness && (
        <Card className="p-5 mb-6">
          <div className="flex items-center gap-6">
            <div className="flex items-center justify-center w-20 h-20 rounded-full border-4 border-gray-200 dark:border-gray-700 relative">
              <svg
                className="absolute inset-0 w-full h-full -rotate-90"
                viewBox="0 0 80 80"
              >
                <circle
                  cx="40"
                  cy="40"
                  r="36"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="4"
                  className="text-gray-200 dark:text-gray-700"
                />
                <circle
                  cx="40"
                  cy="40"
                  r="36"
                  fill="none"
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeDasharray={`${(score / 100) * 226} 226`}
                  className={
                    score >= 80
                      ? "text-emerald-500"
                      : score >= 50
                        ? "text-yellow-500"
                        : "text-red-500"
                  }
                  stroke="currentColor"
                />
              </svg>
              <span className="text-xl font-bold text-gray-900 dark:text-white z-10">
                {Math.round(score)}%
              </span>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-6 text-sm">
                <div>
                  <span className="text-2xl font-light text-gray-900 dark:text-white">
                    {readiness.passed}
                  </span>
                  <span className="text-gray-500 dark:text-gray-400 ml-1">
                    passed
                  </span>
                </div>
                <div>
                  <span className="text-2xl font-light text-red-500">
                    {readiness.failed}
                  </span>
                  <span className="text-gray-500 dark:text-gray-400 ml-1">
                    failed
                  </span>
                </div>
                <div>
                  <span className="text-2xl font-light text-gray-500">
                    {readiness.total}
                  </span>
                  <span className="text-gray-500 dark:text-gray-400 ml-1">
                    total
                  </span>
                </div>
              </div>
              {Object.entries(readiness.category_scores).length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {Object.entries(readiness.category_scores).map(
                    ([cat, catScore]) => (
                      <span
                        key={cat}
                        className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${CATEGORY_COLORS[cat as CheckCategory] || STATUS_COLORS.not_started}`}
                      >
                        {cat}: {Math.round(catScore)}%
                      </span>
                    ),
                  )}
                </div>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Blockers */}
      {blockers.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-red-500 uppercase tracking-wider mb-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            Blockers ({blockers.length})
          </h2>
          <div className="space-y-2">
            {blockers.map((b) => (
              <Card key={b.id} className="p-3 border-red-500/30">
                <div className="flex items-center gap-3">
                  <Shield className="w-4 h-4 text-red-500 shrink-0" />
                  <span className="text-sm font-medium text-gray-900 dark:text-white flex-1">
                    {b.title}
                  </span>
                  <span
                    className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${CATEGORY_COLORS[b.category]}`}
                  >
                    {b.category}
                  </span>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Checklists */}
      {checklists.length === 0 ? (
        <EmptyState
          icon={<Shield className="w-12 h-12" />}
          title="No checklists yet"
          description="Create a compliance checklist to track launch readiness requirements."
          actionLabel="Add Checklist"
          onAction={() => setCreateOpen(true)}
        />
      ) : (
        <div className="space-y-3">
          {checklists.map((cl) => (
            <ChecklistAccordion
              key={cl.id}
              checklist={cl}
              projectId={projectId!}
            />
          ))}
        </div>
      )}

      {/* Create Checklist Modal */}
      <Modal
        open={createOpen}
        onClose={() => {
          setCreateOpen(false);
          setNewName("");
          setNewDescription("");
        }}
        title="New Checklist"
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label
              htmlFor="clName"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Name <span className="text-red-500">*</span>
            </label>
            <Input
              id="clName"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Production Launch Checklist"
              autoFocus
            />
          </div>
          <div>
            <label
              htmlFor="clDesc"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Description
            </label>
            <TextArea
              id="clDesc"
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder="Optional description..."
              rows={3}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setCreateOpen(false);
                setNewName("");
                setNewDescription("");
              }}
            >
              Cancel
            </Button>
            <Button type="submit" loading={creating}>
              Create Checklist
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
