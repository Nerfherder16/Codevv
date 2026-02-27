import React, { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Settings,
  Trash2,
  Moon,
  Sun,
  AlertTriangle,
  Save,
} from "lucide-react";
import { api } from "../lib/api";
import type { ProjectDetail } from "../types";
import { useToast } from "../contexts/ToastContext";
import { useTheme } from "../contexts/ThemeContext";
import { Button } from "../components/common/Button";
import { Card } from "../components/common/Card";
import { PageHeader } from "../components/common/PageHeader";
import { PageLoading } from "../components/common/LoadingSpinner";
import { Modal } from "../components/common/Modal";
import { Input, TextArea } from "../components/common/Input";
import { MembersSection } from "../components/settings/MembersSection";
import { PendingInvites } from "../components/settings/PendingInvites";

export function SettingsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { theme, toggle: toggleTheme } = useTheme();

  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);

  // Project edit form
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [saving, setSaving] = useState(false);

  // Invite refresh trigger
  const [inviteRefreshKey, setInviteRefreshKey] = useState(0);

  // Archive confirmation
  const [archiveModalOpen, setArchiveModalOpen] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [archiveConfirmText, setArchiveConfirmText] = useState("");

  const fetchProject = useCallback(async () => {
    if (!projectId) return;
    try {
      const data = await api.get<ProjectDetail>(`/projects/${projectId}`);
      setProject(data);
      setEditName(data.name);
      setEditDesc(data.description || "");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load project";
      toast(msg, "error");
    } finally {
      setLoading(false);
    }
  }, [projectId, toast]);

  useEffect(() => {
    fetchProject();
  }, [fetchProject]);

  const handleSaveProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editName.trim()) {
      toast("Project name is required.", "error");
      return;
    }

    setSaving(true);
    try {
      await api.patch(`/projects/${projectId}`, {
        name: editName.trim(),
        description: editDesc.trim() || null,
      });
      toast("Project settings saved!", "success");
      // Update local state
      setProject((prev) =>
        prev
          ? {
              ...prev,
              name: editName.trim(),
              description: editDesc.trim() || null,
            }
          : null,
      );
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to save settings";
      toast(msg, "error");
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async () => {
    if (archiveConfirmText !== project?.name) {
      toast("Type the project name to confirm.", "error");
      return;
    }

    setArchiving(true);
    try {
      await api.patch(`/projects/${projectId}`, { archived: true });
      toast("Project archived.", "success");
      navigate("/projects");
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to archive project";
      toast(msg, "error");
    } finally {
      setArchiving(false);
    }
  };

  if (loading) {
    return <PageLoading />;
  }

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <Settings className="w-12 h-12 text-gray-400 dark:text-gray-600 mb-3" />
        <p className="text-gray-500 dark:text-gray-400 text-lg font-medium">
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
    <div className="max-w-3xl">
      <PageHeader
        title="Settings"
        description={`Manage settings for ${project.name}`}
        action={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(`/projects/${projectId}`)}
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>
        }
      />

      {/* Project Settings */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <Settings className="w-5 h-5" />
          Project Details
        </h2>
        <Card>
          <form onSubmit={handleSaveProject} className="space-y-4">
            <div>
              <label
                htmlFor="projectName"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                Name <span className="text-red-500">*</span>
              </label>
              <Input
                id="projectName"
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </div>
            <div>
              <label
                htmlFor="projectDesc"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                Description
              </label>
              <TextArea
                id="projectDesc"
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                rows={3}
                placeholder="A brief description of the project..."
                className="resize-none"
              />
            </div>
            <div className="flex justify-end">
              <Button type="submit" loading={saving}>
                <Save className="w-4 h-4" />
                Save Changes
              </Button>
            </div>
          </form>
        </Card>
      </section>

      {/* Members */}
      <MembersSection
        projectId={projectId!}
        members={project.members}
        onInviteSent={() => setInviteRefreshKey((k) => k + 1)}
      />

      {/* Pending Invites */}
      <PendingInvites projectId={projectId!} refreshKey={inviteRefreshKey} />

      {/* Theme */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          {theme === "dark" ? (
            <Moon className="w-5 h-5" />
          ) : (
            <Sun className="w-5 h-5" />
          )}
          Appearance
        </h2>
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                Theme
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Currently using <span className="font-medium">{theme}</span>{" "}
                mode
              </p>
            </div>
            <button
              onClick={toggleTheme}
              className="relative inline-flex h-8 w-14 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-teal/20 bg-gray-200 dark:bg-teal"
            >
              <span
                className={`inline-flex items-center justify-center h-6 w-6 rounded-full bg-white shadow-sm transition-transform ${
                  theme === "dark" ? "translate-x-7" : "translate-x-1"
                }`}
              >
                {theme === "dark" ? (
                  <Moon className="w-3.5 h-3.5 text-teal" />
                ) : (
                  <Sun className="w-3.5 h-3.5 text-teal" />
                )}
              </span>
            </button>
          </div>
        </Card>
      </section>

      {/* Danger Zone */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-red-600 dark:text-red-400 mb-4 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5" />
          Danger Zone
        </h2>
        <Card className="border-red-200 dark:border-red-900/50">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                Archive Project
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Archive this project and hide it from the project list. This
                action can be reversed by an administrator.
              </p>
            </div>
            <Button
              variant="danger"
              size="sm"
              onClick={() => setArchiveModalOpen(true)}
            >
              <Trash2 className="w-3.5 h-3.5" />
              Archive
            </Button>
          </div>
        </Card>
      </section>

      {/* Archive Confirmation Modal */}
      <Modal
        open={archiveModalOpen}
        onClose={() => {
          setArchiveModalOpen(false);
          setArchiveConfirmText("");
        }}
        title="Archive Project"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
            <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-red-700 dark:text-red-400">
                This will archive the project
              </p>
              <p className="text-xs text-red-600 dark:text-red-400/80 mt-1">
                The project will be hidden from all members. Data will be
                preserved but inaccessible through the normal interface.
              </p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Type <span className="font-mono font-bold">{project.name}</span>{" "}
              to confirm
            </label>
            <Input
              type="text"
              value={archiveConfirmText}
              onChange={(e) => setArchiveConfirmText(e.target.value)}
              placeholder={project.name}
              error
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setArchiveModalOpen(false);
                setArchiveConfirmText("");
              }}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={archiving}
              disabled={archiveConfirmText !== project.name}
              onClick={handleArchive}
            >
              <Trash2 className="w-4 h-4" />
              Archive Project
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
