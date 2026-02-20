import React, { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { Upload, FileText, Loader2 } from "lucide-react";
import { api } from "../lib/api";
import { useToast } from "../contexts/ToastContext";
import { Button } from "../components/common/Button";
import { Card } from "../components/common/Card";
import { PageHeader } from "../components/common/PageHeader";
import { PageLoading } from "../components/common/LoadingSpinner";
import { EmptyState } from "../components/common/EmptyState";
import { relativeTime } from "../lib/utils";

interface DocEntry {
  id: string;
  filename: string;
  content_type: string | null;
  created_at: string | null;
}

export function DocumentsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { toast } = useToast();

  const [docs, setDocs] = useState<DocEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const fetchDocs = useCallback(async () => {
    if (!projectId) return;
    try {
      const data = await api.get<DocEntry[]>(
        `/projects/${projectId}/documents`,
      );
      setDocs(data);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load documents";
      toast(message, "error");
    } finally {
      setLoading(false);
    }
  }, [projectId, toast]);

  useEffect(() => {
    fetchDocs();
  }, [fetchDocs]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !projectId) return;

    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/projects/${projectId}/documents/upload`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("bh-token")}`,
        },
        body: form,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Upload failed" }));
        throw new Error(err.detail || "Upload failed");
      }
      toast("Document uploaded!", "success");
      await fetchDocs();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed";
      toast(message, "error");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  if (loading) {
    return <PageLoading />;
  }

  return (
    <div>
      <PageHeader
        title="Documents"
        description="Upload documents to your project's knowledge base."
        action={
          <label className="cursor-pointer">
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal text-white text-sm font-medium hover:brightness-110 transition-all">
              {uploading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Upload className="w-4 h-4" />
              )}
              {uploading ? "Uploading..." : "Upload Document"}
            </span>
            <input
              type="file"
              className="hidden"
              onChange={handleUpload}
              accept=".txt,.md,.json,.yaml,.yml,.csv,.py,.ts,.tsx,.js,.jsx,.html,.css,.toml,.cfg,.ini,.xml,.sql,.sh,.bat,.ps1,.log,.docx,.doc,.pdf"
              disabled={uploading}
            />
          </label>
        }
      />

      {docs.length === 0 ? (
        <EmptyState
          icon={
            <FileText className="w-10 h-10 text-gray-400 dark:text-gray-600" />
          }
          title="No documents yet"
          description="Upload text files to store them in your project's Recall knowledge base."
          actionLabel="Upload Document"
          onAction={() =>
            document
              .querySelector<HTMLInputElement>('input[type="file"]')
              ?.click()
          }
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {docs.map((doc) => (
            <Card key={doc.id} className="flex items-start gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-cyan-500/10 text-cyan-400 shrink-0">
                <FileText className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-medium text-gray-900 dark:text-white truncate text-sm">
                  {doc.filename}
                </h3>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  {doc.content_type || "text/plain"}
                  {doc.created_at && ` · ${relativeTime(doc.created_at)}`}
                </p>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
