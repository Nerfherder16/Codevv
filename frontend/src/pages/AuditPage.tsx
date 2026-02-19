import React, { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { ClipboardCheck, Plus, FileText, Download } from "lucide-react";
import { api } from "../lib/api";
import { useToast } from "../contexts/ToastContext";
import { Button } from "../components/common/Button";
import { Card } from "../components/common/Card";
import { PageHeader } from "../components/common/PageHeader";
import { PageLoading } from "../components/common/LoadingSpinner";
import { Modal } from "../components/common/Modal";
import { Input } from "../components/common/Input";
import { EmptyState } from "../components/common/EmptyState";
import { relativeTime } from "../lib/utils";

interface AuditReport {
  id: string;
  project_id: string;
  title: string;
  report_json: {
    overall_score: number;
    sections: {
      name: string;
      items: { label: string; value: unknown }[];
      score: number;
    }[];
  } | null;
  status: "generating" | "ready" | "archived";
  generated_by: string;
  created_at: string;
}

const statusConfig: Record<
  AuditReport["status"],
  { color: string; label: string }
> = {
  generating: {
    color: "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300",
    label: "Generating",
  },
  ready: {
    color:
      "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300",
    label: "Ready",
  },
  archived: {
    color: "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400",
    label: "Archived",
  },
};

function buildMarkdown(report: AuditReport): string {
  const { title, report_json, created_at } = report;
  if (!report_json) return `# ${title}\n\nNo report data available.\n`;

  const lines: string[] = [
    `# ${title}`,
    "",
    `**Overall Score:** ${report_json.overall_score}%`,
    `**Generated:** ${new Date(created_at).toLocaleString()}`,
    "",
  ];

  for (const section of report_json.sections) {
    lines.push(`## ${section.name} (${section.score}%)`, "");
    for (const item of section.items) {
      lines.push(`- **${item.label}:** ${String(item.value ?? "N/A")}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

function downloadMarkdown(report: AuditReport) {
  const md = buildMarkdown(report);
  const blob = new Blob([md], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${report.title.replace(/\s+/g, "-").toLowerCase()}-audit.md`;
  a.click();
  URL.revokeObjectURL(url);
}

export function AuditPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { toast } = useToast();

  const [reports, setReports] = useState<AuditReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [generating, setGenerating] = useState(false);

  const fetchReports = useCallback(async () => {
    if (!projectId) return;
    try {
      const data = await api.get<AuditReport[]>(`/projects/${projectId}/audit`);
      setReports(data);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load audit reports";
      toast(message, "error");
    } finally {
      setLoading(false);
    }
  }, [projectId, toast]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast("Report title is required.", "error");
      return;
    }

    setGenerating(true);
    try {
      const report = await api.post<AuditReport>(
        `/projects/${projectId}/audit`,
        { title: title.trim(), sections: [] },
      );
      setReports((prev) => [report, ...prev]);
      setModalOpen(false);
      setTitle("");
      toast("Audit report generation started!", "success");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to generate report";
      toast(message, "error");
    } finally {
      setGenerating(false);
    }
  };

  const handleArchive = async (reportId: string) => {
    try {
      await api.delete(`/projects/${projectId}/audit/${reportId}`);
      setReports((prev) =>
        prev.map((r) =>
          r.id === reportId ? { ...r, status: "archived" as const } : r,
        ),
      );
      toast("Report archived.", "success");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to archive report";
      toast(message, "error");
    }
  };

  if (loading) return <PageLoading />;

  const expanded = reports.find((r) => r.id === expandedId);

  return (
    <div>
      <PageHeader
        title="Audit Prep"
        description="Generate and review audit preparation reports."
        action={
          <Button onClick={() => setModalOpen(true)}>
            <Plus className="w-4 h-4" />
            Generate Report
          </Button>
        }
      />

      {reports.length === 0 ? (
        <EmptyState
          icon={<ClipboardCheck className="w-12 h-12" />}
          title="No audit reports yet"
          description="Generate your first audit preparation report to assess project readiness."
          actionLabel="Generate Report"
          onAction={() => setModalOpen(true)}
        />
      ) : (
        <div className="space-y-3">
          {reports.map((report) => {
            const cfg = statusConfig[report.status];
            const isExpanded = expandedId === report.id;
            const score = report.report_json?.overall_score;

            return (
              <Card key={report.id}>
                <div
                  onClick={() => setExpandedId(isExpanded ? null : report.id)}
                  className="flex items-center justify-between cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <FileText className="w-5 h-5 text-teal shrink-0" />
                    <div>
                      <h3 className="font-semibold text-gray-900 dark:text-white">
                        {report.title}
                      </h3>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span
                          className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full ${cfg.color}`}
                        >
                          {cfg.label}
                        </span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {relativeTime(report.created_at)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {score !== undefined && score !== null && (
                      <span className="text-lg font-semibold text-teal">
                        {score}%
                      </span>
                    )}
                  </div>
                </div>

                {isExpanded && expanded?.report_json && (
                  <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
                    <div className="flex items-center justify-between mb-4">
                      <div className="text-3xl font-light text-teal">
                        {expanded.report_json.overall_score}%
                        <span className="text-sm font-normal text-gray-500 dark:text-gray-400 ml-2">
                          Overall Score
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            downloadMarkdown(expanded);
                          }}
                        >
                          <Download className="w-3.5 h-3.5" />
                          Export
                        </Button>
                        {expanded.status !== "archived" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleArchive(expanded.id);
                            }}
                          >
                            Archive
                          </Button>
                        )}
                      </div>
                    </div>

                    <div className="space-y-4">
                      {expanded.report_json.sections.map((section, idx) => (
                        <div key={idx}>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-sm font-medium text-gray-900 dark:text-white">
                              {section.name}
                            </span>
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              {section.score}%
                            </span>
                          </div>
                          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                            <div
                              className="bg-teal rounded-full h-2 transition-all"
                              style={{ width: `${section.score}%` }}
                            />
                          </div>
                          <ul className="mt-2 space-y-1">
                            {section.items.map((item, i) => (
                              <li
                                key={i}
                                className="text-xs text-gray-600 dark:text-gray-400 flex justify-between"
                              >
                                <span>{item.label}</span>
                                <span className="font-mono text-gray-500">
                                  {String(item.value ?? "N/A")}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setTitle("");
        }}
        title="Generate Audit Report"
      >
        <form onSubmit={handleGenerate} className="space-y-4">
          <div>
            <label
              htmlFor="auditTitle"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Report Title <span className="text-red-500">*</span>
            </label>
            <Input
              id="auditTitle"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Q1 2026 Security Audit"
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setModalOpen(false);
                setTitle("");
              }}
            >
              Cancel
            </Button>
            <Button type="submit" loading={generating}>
              <ClipboardCheck className="w-4 h-4" />
              Generate
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
