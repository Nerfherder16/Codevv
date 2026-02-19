import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, FolderOpen, Users } from "lucide-react";
import { api } from "../lib/api";
import type { Project } from "../types";
import { useToast } from "../contexts/ToastContext";
import { Button } from "../components/common/Button";
import { Card } from "../components/common/Card";
import { PageHeader } from "../components/common/PageHeader";
import { PageLoading } from "../components/common/LoadingSpinner";
import { Modal } from "../components/common/Modal";
import { relativeTime } from "../lib/utils";
import { Input } from "../components/common/Input";
import { TextArea } from "../components/common/Input";
import {
  PageTransition,
  StaggerList,
  StaggerItem,
} from "../components/common/PageTransition";
import {
  EmptyState,
  FolderIllustration,
} from "../components/common/EmptyState";

export function ProjectListPage() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const fetchProjects = useCallback(async () => {
    try {
      const data = await api.get<Project[]>("/projects");
      setProjects(data);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load projects";
      toast(message, "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

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

  if (loading) {
    return <PageLoading />;
  }

  return (
    <PageTransition>
      <PageHeader
        title="Projects"
        description="Your workspaces for building and collaborating."
        action={
          <Button onClick={() => setModalOpen(true)}>
            <Plus className="w-4 h-4" />
            New Project
          </Button>
        }
      />

      {/* Project grid */}
      {projects.length === 0 ? (
        <EmptyState
          icon={<FolderIllustration />}
          title="No projects yet"
          description="Create your first project to get started."
          actionLabel="Create Project"
          onAction={() => setModalOpen(true)}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((project) => (
            <Card
              key={project.id}
              hover
              onClick={() => navigate(`/projects/${project.id}`)}
              className="flex flex-col justify-between"
            >
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white truncate">
                  {project.name}
                </h3>
                {project.description && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                    {project.description}
                  </p>
                )}
              </div>
              <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100 dark:border-gray-800">
                <span className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                  <Users className="w-3.5 h-3.5" />
                  {project.member_count}{" "}
                  {project.member_count === 1 ? "member" : "members"}
                </span>
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  {relativeTime(project.updated_at)}
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* New Project Modal */}
      <Modal open={modalOpen} onClose={closeModal} title="New Project">
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label
              htmlFor="projectName"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Project Name <span className="text-red-500">*</span>
            </label>
            <Input
              id="projectName"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Awesome Project"
              autoFocus
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
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What are you building?"
              rows={3}
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
    </PageTransition>
  );
}
