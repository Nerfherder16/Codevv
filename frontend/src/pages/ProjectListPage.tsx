import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Plus,
  FolderOpen,
  Users,
  Sun,
  Moon,
  LogOut,
  ArrowRight,
  Clock,
  Layers,
  Mail,
  Check,
  Settings,
  User as UserIcon,
  Building2,
  ChevronDown,
} from "lucide-react";
import { api } from "../lib/api";
import type { Project, ProjectInvite } from "../types";
import { useToast } from "../contexts/ToastContext";
import { useAuth } from "../contexts/AuthContext";
import { useTheme } from "../contexts/ThemeContext";
import { Button } from "../components/common/Button";
import { Modal } from "../components/common/Modal";
import { PageLoading } from "../components/common/LoadingSpinner";
import { relativeTime } from "../lib/utils";

export function ProjectListPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, logout, userOrgs, currentOrg, setCurrentOrg } = useAuth();
  const { theme, toggle } = useTheme();

  const [projects, setProjects] = useState<Project[]>([]);
  const [invites, setInvites] = useState<ProjectInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const [orgOpen, setOrgOpen] = useState(false);

  const fetchProjects = useCallback(async () => {
    try {
      const orgParam = currentOrg ? `?org_id=${currentOrg.id}` : "";
      const data = await api.get<Project[]>(`/projects${orgParam}`);
      setProjects(data);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load projects";
      toast(message, "error");
    } finally {
      setLoading(false);
    }
  }, [toast, currentOrg]);

  const fetchInvites = useCallback(async () => {
    try {
      const data = await api.get<ProjectInvite[]>("/invites/mine");
      setInvites(data);
    } catch {
      // Silently fail — invites section is optional
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchProjects();
    fetchInvites();
  }, [fetchProjects, fetchInvites]);

  const handleAcceptInvite = useCallback(
    async (invite: ProjectInvite) => {
      setAcceptingId(invite.id);
      try {
        const res = await api.post<{ project_id: string }>(
          `/invites/${invite.id}/accept`,
          {},
        );
        toast(`Joined ${invite.project_name}!`, "success");
        setInvites((prev) => prev.filter((i) => i.id !== invite.id));
        navigate(`/projects/${res.project_id}`);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to accept invite";
        toast(message, "error");
      } finally {
        setAcceptingId(null);
      }
    },
    [toast, navigate],
  );

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast("Project name is required.", "error");
      return;
    }
    setCreating(true);
    try {
      const project = await api.post<Project>("/projects", {
        name: name.trim(),
        description: description.trim() || null,
        org_id: currentOrg?.id || null,
      });
      toast("Project created!", "success");
      setModalOpen(false);
      setName("");
      setDescription("");
      navigate(`/projects/${project.id}`);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to create project";
      toast(message, "error");
    } finally {
      setCreating(false);
    }
  };

  const closeModal = () => {
    setModalOpen(false);
    setName("");
    setDescription("");
  };

  if (loading) return <PageLoading />;

  const isFirstVisit = projects.length === 0;
  const totalMembers = projects.reduce((sum, p) => sum + p.member_count, 0);
  const recentProject =
    projects.length > 0
      ? projects.reduce((latest, p) =>
          new Date(p.updated_at) > new Date(latest.updated_at) ? p : latest,
        )
      : null;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* ── Header bar ─────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-gray-200/80 dark:border-white/[0.04] bg-white/80 dark:bg-gray-950/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 sm:h-20 flex items-center justify-between">
          {/* Logo */}
          <img
            src="/codevvrevlogo.png"
            alt="Codevv"
            className="h-10 sm:h-16 w-auto mt-2 sm:mt-4"
          />

          {/* Org switcher */}
          {userOrgs.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setOrgOpen(!orgOpen)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-white/[0.08] hover:bg-gray-50 dark:hover:bg-white/[0.04] transition-colors"
              >
                <Building2 className="w-4 h-4 text-cyan-400" />
                <span className="text-sm text-gray-700 dark:text-gray-300 font-medium max-w-[160px] truncate">
                  {currentOrg?.name || "Personal Workspace"}
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
              </button>
              {orgOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setOrgOpen(false)} />
                  <div className="absolute left-0 top-full mt-2 w-64 z-50 rounded-xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-gray-900 shadow-xl py-1.5">
                    <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                      Switch workspace
                    </div>
                    {userOrgs.map((org) => (
                      <button
                        key={org.id}
                        onClick={() => { setCurrentOrg(org); setOrgOpen(false); }}
                        className={"w-full flex items-center gap-3 px-3 py-2 text-sm transition-colors " + (currentOrg?.id === org.id ? "bg-cyan-500/10 text-cyan-400" : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/[0.04]")}
                      >
                        <div className="w-6 h-6 rounded-md bg-cyan-500/10 flex items-center justify-center shrink-0">
                          <Building2 className="w-3.5 h-3.5 text-cyan-400" />
                        </div>
                        <span className="truncate">{org.name}</span>
                        {currentOrg?.id === org.id && <Check className="w-3.5 h-3.5 ml-auto shrink-0" />}
                      </button>
                    ))}
                    <div className="border-t border-gray-100 dark:border-white/[0.06] mt-1 pt-1">
                      <button
                        onClick={() => { setOrgOpen(false); navigate("/orgs/new"); }}
                        className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/[0.04] transition-colors"
                      >
                        <Plus className="w-4 h-4" />
                        New organization
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Right controls */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={toggle}
              className="p-2 rounded-xl text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-white/[0.05] hover:text-gray-600 dark:hover:text-gray-200 transition-all duration-200"
              title="Toggle theme"
            >
              {theme === "dark" ? (
                <Sun className="w-[18px] h-[18px]" />
              ) : (
                <Moon className="w-[18px] h-[18px]" />
              )}
            </button>

            {user && (
              <>
                <div className="w-px h-6 bg-gray-200 dark:bg-white/[0.06] mx-1" />

                {/* Profile dropdown */}
                <div className="relative">
                  <button
                    onClick={() => setProfileOpen(!profileOpen)}
                    className="flex items-center gap-2.5 text-sm px-2 py-1.5 rounded-xl hover:bg-gray-100 dark:hover:bg-white/[0.05] transition-all duration-200"
                  >
                    <div className="w-8 h-8 rounded-xl bg-cyan-500 text-white flex items-center justify-center text-xs font-bold shadow-lg shadow-cyan-500/20">
                      {user.display_name?.charAt(0)?.toUpperCase() || "U"}
                    </div>
                    <span className="hidden sm:inline text-gray-600 dark:text-gray-400 font-medium">
                      {user.display_name}
                    </span>
                  </button>

                  {profileOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-40"
                        onClick={() => setProfileOpen(false)}
                      />
                      <div className="absolute right-0 top-full mt-2 w-56 z-50 rounded-xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-gray-900 shadow-xl py-1.5">
                        <div className="px-4 py-3 border-b border-gray-100 dark:border-white/[0.06]">
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                            {user.display_name}
                          </p>
                          <p className="text-xs text-gray-400 dark:text-gray-500 truncate">
                            {user.email}
                          </p>
                        </div>
                        <button
                          onClick={() => {
                            setProfileOpen(false);
                            navigate("/profile");
                          }}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/[0.04] transition-colors"
                        >
                          <UserIcon className="w-4 h-4" />
                          Profile
                        </button>
                        <button
                          onClick={() => {
                            setProfileOpen(false);
                            navigate("/profile");
                          }}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/[0.04] transition-colors"
                        >
                          <Settings className="w-4 h-4" />
                          Settings
                        </button>
                        <div className="border-t border-gray-100 dark:border-white/[0.06] mt-1 pt-1">
                          <button
                            onClick={() => {
                              setProfileOpen(false);
                              logout();
                            }}
                            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-500 dark:text-red-400 hover:bg-gray-50 dark:hover:bg-white/[0.04] transition-colors"
                          >
                            <LogOut className="w-4 h-4" />
                            Sign Out
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* ── Main content ───────────────────────────────────── */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        {/* Hero */}
        <div className="mb-10 animate-in">
          <h1 className="text-2xl sm:text-4xl font-light tracking-tight text-gray-900 dark:text-gray-100">
            {user ? (
              <>
                {isFirstVisit ? "Welcome" : "Welcome back"},{" "}
                <span className="font-semibold text-cyan-400">
                  {user.display_name?.split(" ")[0] || "there"}
                </span>
              </>
            ) : (
              "Your Projects"
            )}
          </h1>
          <p className="text-gray-500 dark:text-gray-500 mt-2 text-base">
            {isFirstVisit
              ? "Get started by creating a project or accepting an invite."
              : "Design, build, and ship — all in one place."}
          </p>
        </div>

        {/* ── Pending Invites ──────────────────────────────── */}
        {invites.length > 0 && (
          <div className="mb-8 animate-in">
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-gray-400 dark:text-gray-500 mb-3 flex items-center gap-2">
              <Mail className="w-4 h-4" />
              Pending Invites
            </h2>
            <div className="space-y-3">
              {invites.map((invite) => (
                <div
                  key={invite.id}
                  className="flex items-center justify-between gap-4 rounded-xl border border-cyan-200/60 dark:border-cyan-500/20 bg-cyan-50/50 dark:bg-cyan-500/[0.04] p-4"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center shrink-0">
                      <FolderOpen className="w-5 h-5 text-cyan-500" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                        {invite.project_name}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Invited by{" "}
                        <span className="font-medium">
                          {invite.invited_by_name}
                        </span>{" "}
                        as{" "}
                        <span className="capitalize font-medium">
                          {invite.role}
                        </span>
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleAcceptInvite(invite)}
                    loading={acceptingId === invite.id}
                    disabled={acceptingId !== null}
                  >
                    <Check className="w-3.5 h-3.5" />
                    Accept
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Stats row */}
        {projects.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-10 animate-in">
            <div className="rounded-xl border border-gray-200/80 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] p-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-cyan-500/10 flex items-center justify-center">
                  <Layers className="w-4 h-4 text-cyan-400" />
                </div>
                <div>
                  <p className="text-2xl font-light text-gray-900 dark:text-gray-100">
                    {projects.length}
                  </p>
                  <p className="text-xs uppercase tracking-wider text-gray-400 dark:text-gray-500">
                    Projects
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-gray-200/80 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] p-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-violet-500/10 flex items-center justify-center">
                  <Users className="w-4 h-4 text-violet-500" />
                </div>
                <div>
                  <p className="text-2xl font-light text-gray-900 dark:text-gray-100">
                    {totalMembers}
                  </p>
                  <p className="text-xs uppercase tracking-wider text-gray-400 dark:text-gray-500">
                    Members
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-gray-200/80 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] p-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                  <Clock className="w-4 h-4 text-emerald-500" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                    {recentProject?.name || "—"}
                  </p>
                  <p className="text-xs uppercase tracking-wider text-gray-400 dark:text-gray-500">
                    Last active
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Section header */}
        <div className="mb-6">
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-gray-400 dark:text-gray-500">
            {projects.length > 0 ? "All Projects" : "Your Projects"}
          </h2>
        </div>

        {/* Project grid */}
        {projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center animate-in">
            <div className="w-20 h-20 rounded-2xl bg-gray-100 dark:bg-white/[0.03] border border-gray-200 dark:border-white/[0.06] flex items-center justify-center mb-6">
              <FolderOpen className="w-8 h-8 text-gray-300 dark:text-gray-600" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-200 mb-2">
              No projects yet
            </h3>
            <p className="text-gray-400 dark:text-gray-500 text-sm max-w-sm mb-8">
              Create your first project to start designing architecture,
              generating code, and deploying — all with AI assistance.
            </p>
            <Button onClick={() => setModalOpen(true)}>
              <Plus className="w-4 h-4" />
              Create Your First Project
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((project) => (
              <button
                key={project.id}
                onClick={() => navigate(`/projects/${project.id}`)}
                className="group relative text-left rounded-xl border border-gray-200/80 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] p-5 transition-all duration-300 hover:border-cyan-400/40 dark:hover:border-cyan-400/20 hover:shadow-lg dark:hover:shadow-cyan-500/[0.04] glow-card"
              >
                <div className="flex items-start justify-between mb-3">
                  <h3 className="font-semibold text-gray-900 dark:text-white truncate pr-2">
                    {project.name}
                  </h3>
                  <ArrowRight className="w-4 h-4 text-gray-300 dark:text-gray-600 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all duration-200 flex-shrink-0 mt-0.5" />
                </div>

                {project.description ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2 mb-4">
                    {project.description}
                  </p>
                ) : (
                  <p className="text-sm text-gray-300 dark:text-gray-600 italic mb-4">
                    No description
                  </p>
                )}

                <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-white/[0.04]">
                  <span className="inline-flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                    <Users className="w-3.5 h-3.5" />
                    {project.member_count}{" "}
                    {project.member_count === 1 ? "member" : "members"}
                  </span>
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    {relativeTime(project.updated_at)}
                  </span>
                </div>
              </button>
            ))}

            {/* New project card */}
            <button
              onClick={() => setModalOpen(true)}
              className="group rounded-xl border-2 border-dashed border-gray-200 dark:border-white/[0.06] p-5 flex flex-col items-center justify-center gap-3 min-h-[160px] transition-all duration-300 hover:border-cyan-400/40 dark:hover:border-cyan-400/20 hover:bg-cyan-500/[0.02]"
            >
              <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-white/[0.04] flex items-center justify-center group-hover:bg-cyan-500/10 transition-colors duration-200">
                <Plus className="w-5 h-5 text-gray-400 dark:text-gray-500 group-hover:text-cyan-400 transition-colors duration-200" />
              </div>
              <span className="text-sm font-medium text-gray-400 dark:text-gray-500 group-hover:text-cyan-400 transition-colors duration-200">
                New Project
              </span>
            </button>
          </div>
        )}
      </main>

      {/* ── New Project Modal ──────────────────────────────── */}
      <Modal open={modalOpen} onClose={closeModal} title="New Project">
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label
              htmlFor="projectName"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Project Name <span className="text-red-500">*</span>
            </label>
            <input
              id="projectName"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Awesome Project"
              autoFocus
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
            />
          </div>
          <div>
            <label
              htmlFor="projectDesc"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Description
            </label>
            <textarea
              id="projectDesc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What are you building?"
              rows={3}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 resize-none"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={closeModal}>
              Cancel
            </Button>
            <Button type="submit" loading={creating}>
              Create Project
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
