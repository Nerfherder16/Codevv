import React, { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { Upload, FileText, Loader2, Eye, X, Download } from "lucide-react";
import { api } from "../lib/api";
import { useToast } from "../contexts/ToastContext";
import { Button } from "../components/common/Button";
import { Card } from "../components/common/Card";
import { PageHeader } from "../components/common/PageHeader";
import { PageLoading } from "../components/common/LoadingSpinner";
import { EmptyState } from "../components/common/EmptyState";
import { relativeTime, formatBytes } from "../lib/utils";

interface DocEntry {
  id: string;
  filename: string;
  mime_type: string | null;
  size_bytes: number | null;
  memory_id: string | null;
  created_at: string | null;
}

export function DocumentsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { toast } = useToast();

  const [docs, setDocs] = useState<DocEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  // View modal
  const [viewDoc, setViewDoc] = useState<DocEntry | null>(null);
  const [viewContent, setViewContent] = useState<string>("");
  const [viewLoading, setViewLoading] = useState(false);

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
      const headers: Record<string, string> = {};
      const token = localStorage.getItem("bh-token");
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch(`/api/projects/${projectId}/documents/upload`, {
        method: "POST",
        headers,
        body: form,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Upload failed" }));
        throw new Error(err.detail || "Upload failed");
      }
      toast("Document uploaded successfully", "success");
      await fetchDocs();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed";
      toast(message, "error");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleView = async (doc: DocEntry) => {
    setViewDoc(doc);
    setViewContent("");
    setViewLoading(true);
    try {
      const data = await api.get<{ content?: string; text?: string }>(
        `/projects/${projectId}/documents/${doc.id}`,
      );
      setViewContent(data.content || data.text || "(No content)");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load content";
      setViewContent(`Error: ${message}`);
    } finally {
      setViewLoading(false);
    }
  };

  const handleDownload = (doc: DocEntry) => {
    const token = localStorage.getItem("bh-token");
    const url = `/api/projects/${projectId}/documents/${doc.id}/download`;
    // Trigger download via anchor element
    const a = document.createElement("a");
    a.href = url;
    a.download = doc.filename;
    if (token) {
      // Fetch with auth and create object URL
      fetch(url, { headers: { Authorization: `Bearer ${token}` } })
        .then((res) => res.blob())
        .then((blob) => {
          const blobUrl = URL.createObjectURL(blob);
          a.href = blobUrl;
          a.click();
          URL.revokeObjectURL(blobUrl);
        })
        .catch(() => toast("Download failed", "error"));
    } else {
      a.click();
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
              accept=".txt,.md,.json,.yaml,.yml,.csv,.py,.ts,.tsx,.js,.jsx,.html,.css,.toml,.cfg,.ini,.xml,.sql,.sh,.bat,.ps1,.log,.docx,.doc"
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
          description="Upload text files or DOCX documents to store them in your project's knowledge base."
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
            <Card
              key={doc.id}
              className="flex items-start gap-3 hover:border-cyan-500/30 transition-colors"
            >
              <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-cyan-500/10 text-cyan-400 shrink-0">
                <FileText className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-medium text-gray-900 dark:text-white truncate text-sm">
                  {doc.filename}
                </h3>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  {doc.size_bytes != null
                    ? formatBytes(doc.size_bytes)
                    : doc.mime_type || ""}
                  {doc.created_at && ` · ${relativeTime(doc.created_at)}`}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0 mt-0.5">
                <button
                  onClick={() => handleView(doc)}
                  title="View content"
                  className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/[0.06] transition-colors"
                >
                  <Eye className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDownload(doc)}
                  title="Download original"
                  className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/[0.06] transition-colors"
                >
                  <Download className="w-4 h-4" />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* View document modal */}
      {viewDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col mx-4">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                  {viewDoc.filename}
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  {viewDoc.size_bytes != null
                    ? formatBytes(viewDoc.size_bytes)
                    : viewDoc.mime_type || ""}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleDownload(viewDoc)}
                  title="Download"
                  className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  <Download className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewDoc(null)}
                  className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-4">
              {viewLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                </div>
              ) : (
                <pre className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-mono leading-relaxed">
                  {viewContent}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
