import React, { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Users,
  Pencil,
  Lightbulb,
  FolderOpen,
  Activity,
  Boxes,
  FileText,
  ArrowRight,
  Clock,
} from "lucide-react";
import { api } from "../lib/api";
import type {
  ProjectDetail,
  Canvas,
  Idea,
  Activity as ActivityType,
} from "../types";
import { useToast } from "../contexts/ToastContext";
import { useEventStreamContext } from "../contexts/EventStreamContext";
import { Card } from "../components/common/Card";
import { PageHeader } from "../components/common/PageHeader";
import { PageLoading } from "../components/common/LoadingSpinner";
import { Button } from "../components/common/Button";
import { relativeTime } from "../lib/utils";
import { PageTransition } from "../components/common/PageTransition";
import { ROLE_COLORS, STATUS_COLORS } from "../lib/constants";

// ─── KPI Card ────────────────────────────────────────────────────────────────
interface KpiCardProps {
  icon: React.ReactNode;
  label: string;
  value: number;
  onClick?: () => void;
}

function KpiCard({ icon, label, value, onClick }: KpiCardProps) {
  return (
    <Card
      hover={!!onClick}
      onClick={onClick}
      className="flex items-center gap-4 p-5"
    >
      <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-[var(--accent-primary)]/10 text-[var(--accent-primary)] shrink-0">
        {icon}
      </div>
      <div>
        <p className="text-2xl font-light text-[var(--text-primary)]">
          {value}
        </p>
        <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
          {label}
        </p>
      </div>
    </Card>
  );
}

// ─── Activity Feed ────────────────────────────────────────────────────────────
function activityIcon(entityType: string) {
  switch (entityType) {
    case "idea":
      return <Lightbulb className="w-3.5 h-3.5" />;
    case "canvas":
    case "canvas_component":
      return <Pencil className="w-3.5 h-3.5" />;
    case "document":
      return <FileText className="w-3.5 h-3.5" />;
    case "compliance_check":
      return <Boxes className="w-3.5 h-3.5" />;
    default:
      return <Activity className="w-3.5 h-3.5" />;
  }
}

function activityLabel(item: ActivityType) {
  const who = item.actor_name ?? "Someone";
  const what = item.entity_name
    ? `"${item.entity_name}"`
    : item.entity_id.slice(0, 8);
  const action = item.action.replace(/_/g, " ").replace(/^check /, "marked ");
  return `${who} ${action} ${what}`;
}

interface ActivityFeedProps {
  items: ActivityType[];
  loading: boolean;
}

function ActivityFeed({ items, loading }: ActivityFeedProps) {
  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <div
            key={i}
            className="h-10 rounded-lg bg-white/[0.03] animate-pulse"
          />
        ))}
      </div>
    );
  }
  if (!items.length) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <Clock className="w-8 h-8 text-[var(--text-muted)] mb-2" />
        <p className="text-sm text-[var(--text-muted)]">No activity yet</p>
      </div>
    );
  }
  return (
    <ol className="space-y-1">
      {items.map((item) => (
        <li
          key={item.id}
          className="flex items-start gap-3 px-3 py-2 rounded-lg hover:bg-white/[0.03] transition-colors"
        >
          <span className="mt-0.5 flex items-center justify-center w-5 h-5 rounded-full bg-[var(--accent-primary)]/10 text-[var(--accent-primary)] shrink-0">
            {activityIcon(item.entity_type)}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-[var(--text-secondary)] truncate">
              {activityLabel(item)}
            </p>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              {relativeTime(item.created_at)}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export function ProjectOverviewPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { clearBadge, lastEvent } = useEventStreamContext();

  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [canvases, setCanvases] = useState<Canvas[]>([]);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [activities, setActivities] = useState<ActivityType[]>([]);
  const [loading, setLoading] = useState(true);
  const [activityLoading, setActivityLoading] = useState(true);

  const fetchCore = useCallback(async () => {
    if (!projectId) return;
    try {
      const [proj, canv, ide] = await Promise.all([
        api.get<ProjectDetail>(`/projects/${projectId}`),
        api.get<Canvas[]>(`/projects/${projectId}/canvases`).catch(() => []),
        api.get<Idea[]>(`/projects/${projectId}/ideas`).catch(() => []),
      ]);
      setProject(proj);
      setCanvases(canv);
      setIdeas(ide);
    } catch (err) {
      toast(
        err instanceof Error ? err.message : "Failed to load project",
        "error",
      );
    } finally {
      setLoading(false);
    }
  }, [projectId, toast]);

  const fetchActivity = useCallback(async () => {
    if (!projectId) return;
    setActivityLoading(true);
    try {
      const data = await api.activity.list(projectId, { limit: 20 });
      setActivities(data);
    } catch {
      // activity feed is non-critical
    } finally {
      setActivityLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchCore();
    fetchActivity();
  }, [fetchCore, fetchActivity]);

  // Clear badge when visiting this project
  useEffect(() => {
    if (projectId) clearBadge(projectId);
  }, [projectId, clearBadge]);

  // Refresh activity feed on real-time events for this project
  useEffect(() => {
    if (!lastEvent || !projectId) return;
    const eventProjectId = lastEvent.payload?.project_id as string | undefined;
    if (eventProjectId === projectId) {
      fetchActivity();
    }
  }, [lastEvent, projectId, fetchActivity]);

  if (loading) return <PageLoading />;

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <FolderOpen className="w-12 h-12 text-[var(--text-muted)] mb-3" />
        <p className="text-[var(--text-secondary)] text-lg font-medium">
          Project not found
        </p>
        <Button
          variant="ghost"
          className="mt-4"
          onClick={() => navigate("/projects")}
        >
          Back to Projects
        </Button>
      </div>
    );
  }

  return (
    <PageTransition>
      <PageHeader
        title={project.name}
        description={project.description || undefined}
        action={
          <Button variant="secondary" onClick={() => navigate("/projects")}>
            All Projects
          </Button>
        }
      />

      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <KpiCard
          icon={<Pencil className="w-5 h-5" />}
          label="Canvases"
          value={canvases.length}
          onClick={() => navigate(`/projects/${projectId}/canvases`)}
        />
        <KpiCard
          icon={<Lightbulb className="w-5 h-5" />}
          label="Ideas"
          value={ideas.length}
          onClick={() => navigate(`/projects/${projectId}/ideas`)}
        />
        <KpiCard
          icon={<Users className="w-5 h-5" />}
          label="Members"
          value={project.members.length}
        />
        <KpiCard
          icon={<Activity className="w-5 h-5" />}
          label="Events"
          value={activities.length}
        />
      </div>

      {/* Two-column: content left, activity right */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: members + recent items (2/3 width) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Members */}
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--text-muted)] mb-3">
              Members
            </h2>
            {project.members.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">
                No members yet.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {project.members.map((member) => (
                  <Card key={member.id} className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-9 h-9 rounded-full bg-gradient-to-br from-[var(--accent-primary)] to-[var(--accent-secondary)] text-[var(--bg-page)] text-sm font-semibold shrink-0">
                      {member.display_name
                        .split(" ")
                        .map((w) => w[0])
                        .join("")
                        .toUpperCase()
                        .slice(0, 2)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                        {member.display_name}
                      </p>
                      <p className="text-xs text-[var(--text-muted)] truncate">
                        {member.email}
                      </p>
                    </div>
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded-full ${ROLE_COLORS[member.role] || ROLE_COLORS.viewer}`}
                    >
                      {member.role}
                    </span>
                  </Card>
                ))}
              </div>
            )}
          </section>

          {/* Recent Canvases */}
          {canvases.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                  Recent Canvases
                </h2>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate(`/projects/${projectId}/canvases`)}
                >
                  View all <ArrowRight className="w-3.5 h-3.5 ml-1" />
                </Button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {canvases.slice(0, 4).map((canvas) => (
                  <Card
                    key={canvas.id}
                    hover
                    onClick={() =>
                      navigate(`/projects/${projectId}/canvases/${canvas.id}`)
                    }
                  >
                    <div className="flex items-start gap-3">
                      <Pencil className="w-4 h-4 mt-0.5 text-[var(--text-muted)] shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                          {canvas.name}
                        </p>
                        <p className="text-xs text-[var(--text-muted)] mt-0.5">
                          {canvas.component_count}{" "}
                          {canvas.component_count === 1
                            ? "component"
                            : "components"}{" "}
                          · {relativeTime(canvas.updated_at)}
                        </p>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </section>
          )}

          {/* Recent Ideas */}
          {ideas.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                  Recent Ideas
                </h2>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate(`/projects/${projectId}/ideas`)}
                >
                  View all <ArrowRight className="w-3.5 h-3.5 ml-1" />
                </Button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {ideas.slice(0, 4).map((idea) => (
                  <Card
                    key={idea.id}
                    hover
                    onClick={() =>
                      navigate(`/projects/${projectId}/ideas/${idea.id}`)
                    }
                  >
                    <div className="flex items-start gap-3">
                      <Lightbulb className="w-4 h-4 mt-0.5 text-[var(--text-muted)] shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                          {idea.title}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <span
                            className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[idea.status] || STATUS_COLORS.draft}`}
                          >
                            {idea.status}
                          </span>
                          <span className="text-xs text-[var(--text-muted)]">
                            {relativeTime(idea.updated_at)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Right: live activity feed (1/3 width) */}
        <div className="lg:col-span-1">
          <div className="sticky top-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                Activity
              </h2>
              <span
                className="w-1.5 h-1.5 rounded-full bg-[var(--accent-primary)] animate-pulse"
                title="Live"
              />
            </div>
            <Card className="p-2">
              <ActivityFeed items={activities} loading={activityLoading} />
            </Card>
          </div>
        </div>
      </div>
    </PageTransition>
  );
}
