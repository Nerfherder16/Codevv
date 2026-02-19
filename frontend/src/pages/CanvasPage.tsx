import React, { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Plus, Pencil, Layers, ArrowLeft } from "lucide-react";
import { api } from "../lib/api";
import type { Canvas } from "../types";
import { useToast } from "../contexts/ToastContext";
import { Button } from "../components/common/Button";
import { Card } from "../components/common/Card";
import { PageHeader } from "../components/common/PageHeader";
import { PageLoading } from "../components/common/LoadingSpinner";
import { Modal } from "../components/common/Modal";
import { relativeTime } from "../lib/utils";
import { Input } from "../components/common/Input";
import { PageTransition } from "../components/common/PageTransition";
import {
  EmptyState,
  CanvasIllustration,
} from "../components/common/EmptyState";

export function CanvasPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [canvases, setCanvases] = useState<Canvas[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");

  const fetchCanvases = useCallback(async () => {
    if (!projectId) return;

    try {
      const data = await api.get<Canvas[]>(`/projects/${projectId}/canvases`);
      setCanvases(data);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load canvases";
      toast(message, "error");
    } finally {
      setLoading(false);
    }
  }, [projectId, toast]);

  useEffect(() => {
    fetchCanvases();
  }, [fetchCanvases]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      toast("Canvas name is required.", "error");
      return;
    }

    setCreating(true);
    try {
      const canvas = await api.post<Canvas>(`/projects/${projectId}/canvases`, {
        name: name.trim(),
      });
      toast("Canvas created!", "success");
      setModalOpen(false);
      setName("");
      navigate(`/projects/${projectId}/canvas/${canvas.id}`);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to create canvas";
      toast(message, "error");
    } finally {
      setCreating(false);
    }
  };

  const closeModal = () => {
    setModalOpen(false);
    setName("");
  };

  if (loading) {
    return <PageLoading />;
  }

  return (
    <div>
      <PageHeader
        title="Canvases"
        description="Visual architecture diagrams for your project."
        action={
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(`/projects/${projectId}`)}
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </Button>
            <Button onClick={() => setModalOpen(true)}>
              <Plus className="w-4 h-4" />
              New Canvas
            </Button>
          </div>
        }
      />

      {/* Canvas grid */}
      {canvases.length === 0 ? (
        <EmptyState
          icon={<CanvasIllustration />}
          title="No canvases yet"
          description="Create a canvas to start designing your architecture."
          actionLabel="Create Canvas"
          onAction={() => setModalOpen(true)}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {canvases.map((canvas) => (
            <Card
              key={canvas.id}
              hover
              onClick={() =>
                navigate(`/projects/${projectId}/canvas/${canvas.id}`)
              }
              className="flex flex-col justify-between"
            >
              <div className="flex items-start gap-3">
                <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-teal/10 text-teal shrink-0">
                  <Pencil className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-gray-900 dark:text-white truncate">
                    {canvas.name}
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                    {canvas.component_count}{" "}
                    {canvas.component_count === 1 ? "component" : "components"}
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-end mt-4 pt-3 border-t border-gray-100 dark:border-gray-800">
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  Updated {relativeTime(canvas.updated_at)}
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* New Canvas Modal */}
      <Modal open={modalOpen} onClose={closeModal} title="New Canvas">
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label
              htmlFor="canvasName"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Canvas Name <span className="text-red-500">*</span>
            </label>
            <Input
              id="canvasName"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Backend Architecture"
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={closeModal}>
              Cancel
            </Button>
            <Button type="submit" loading={creating}>
              Create Canvas
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
