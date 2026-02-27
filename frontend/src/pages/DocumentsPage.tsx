import React, { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Upload,
  FileText,
  Image,
  File,
  Download,
  X,
  Trash2,
  MoreHorizontal,
  Sparkles,
  Loader2,
  Eye,
} from "lucide-react";
import { api } from "../lib/api";
import { useToast } from "../contexts/ToastContext";
import { Button } from "../components/common/Button";
import { PageHeader } from "../components/common/PageHeader";
import { PageLoading } from "../components/common/LoadingSpinner";
import { relativeTime, formatBytes } from "../lib/utils";

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

interface DocEntry {
  id: string;
  filename: string;
  mime_type: string | null;
  size_bytes: number | null;
  memory_id: string | null;
  created_at: string | null;
}

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function fileIcon(mimeType: string | null) {
  if (!mimeType) return <File className="w-4 h-4" />;
  if (mimeType.startsWith("image/")) return <Image className="w-4 h-4" />;
  return <FileText className="w-4 h-4" />;
}

function fileIconBg(mimeType: string | null): string {
  if (!mimeType) return "bg-white/[0.06] text-[var(--text-muted)]";
  if (mimeType.startsWith("image/")) return "bg-violet-500/10 text-violet-400";
  return "bg-[var(--color-teal,#00AFB9)]/10 text-[var(--color-teal,#00AFB9)]";
}

function downloadFile(projectId: string, doc: DocEntry, onError: () => void) {
  const token = localStorage.getItem("bh-token");
  const url = `/api/projects/${projectId}/documents/${doc.id}/download`;
  const a = document.createElement("a");
  a.download = doc.filename;
  if (token) {
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.blob())
      .then((blob) => {
        const blobUrl = URL.createObjectURL(blob);
        a.href = blobUrl;
        a.click();
        URL.revokeObjectURL(blobUrl);
      })
      .catch(onError);
  } else {
    a.href = url;
    a.click();
  }
}

// --------------------------------------------------------------------------
// DocListItem
// --------------------------------------------------------------------------

interface DocListItemProps {
  doc: DocEntry;
  selected: boolean;
  onSelect: () => void;
  onDownload: () => void;
  onDelete: () => void;
}

function DocListItem({
  doc,
  selected,
  onSelect,
  onDownload,
  onDelete,
}: DocListItemProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  return (
    <div
      onClick={onSelect}
      className={[
        "relative flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors group",
        selected
          ? "bg-white/[0.06]"
          : "hover:bg-white/[0.04]",
      ].join(" ")}
    >
      {/* Left accent bar when selected */}
      {selected && (
        <div className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-[var(--color-teal,#00AFB9)]" />
      )}

      {/* File type icon */}
      <div
        className={[
          "flex items-center justify-center w-8 h-8 rounded-lg shrink-0",
          fileIconBg(doc.mime_type),
        ].join(" ")}
      >
        {fileIcon(doc.mime_type)}
      </div>

      {/* Name + meta */}
      <div className="min-w-0 flex-1">
        <p
          className={[
            "text-sm font-medium truncate",
            selected ? "text-white" : "text-[var(--text-primary)]",
          ].join(" ")}
        >
          {doc.filename}
        </p>
        <p className="text-xs text-[var(--text-muted)] mt-0.5 truncate">
          {doc.size_bytes != null ? formatBytes(doc.size_bytes) : doc.mime_type || ""}
          {doc.created_at && ` · ${relativeTime(doc.created_at)}`}
        </p>
      </div>

      {/* Three-dot menu */}
      <div ref={menuRef} className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={() => setMenuOpen((o) => !o)}
          className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-white/[0.06] transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
          title="More actions"
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>

        {menuOpen && (
          <div className="absolute right-0 top-full mt-1 z-20 min-w-[140px] rounded-lg border border-white/[0.08] bg-[var(--bg-elevated,#2d2a3e)] shadow-xl py-1">
            <button
              onClick={() => { setMenuOpen(false); onDownload(); }}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-[var(--text-secondary)] hover:bg-white/[0.06] hover:text-white transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Download
            </button>
            <button
              onClick={() => { setMenuOpen(false); onDelete(); }}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------
// PreviewPane
// --------------------------------------------------------------------------

interface PreviewPaneProps {
  doc: DocEntry | null;
  projectId: string;
  content: string;
  loadingContent: boolean;
  onDownload: () => void;
  onAskClaude: () => void;
}

function PreviewPane({
  doc,
  projectId,
  content,
  loadingContent,
  onDownload,
  onAskClaude,
}: PreviewPaneProps) {
  if (!doc) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center rounded-xl border border-white/[0.06] bg-white/[0.02] min-h-[300px]">
        <Eye className="w-10 h-10 text-[var(--text-muted)] mb-3 opacity-40" />
        <p className="text-sm text-[var(--text-muted)]">Select a document to preview</p>
      </div>
    );
  }

  const isImage = doc.mime_type?.startsWith("image/");
  const imageUrl = isImage
    ? `/api/projects/${projectId}/documents/${doc.id}/download`
    : null;
  const token = localStorage.getItem("bh-token");

  return (
    <div className="flex-1 flex flex-col rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden min-h-[300px]">
      {/* Preview header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] shrink-0">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-[var(--text-primary)] truncate">{doc.filename}</p>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            {doc.size_bytes != null ? formatBytes(doc.size_bytes) : doc.mime_type || ""}
            {doc.created_at && ` · ${relativeTime(doc.created_at)}`}
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 ml-3">
          <button
            onClick={onAskClaude}
            title="Ask Claude about this document"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-violet-300 border border-violet-500/30 hover:bg-violet-500/10 transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Ask Claude
          </button>
          <button
            onClick={onDownload}
            title="Download"
            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-white/[0.06] transition-colors"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Preview body */}
      <div className="flex-1 overflow-auto p-4">
        {loadingContent ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-[var(--text-muted)]" />
          </div>
        ) : isImage && imageUrl ? (
          <div className="flex items-center justify-center h-full">
            <img
              src={`${imageUrl}${token ? `?token=${token}` : ""}`}
              alt={doc.filename}
              className="max-w-full max-h-[60vh] object-contain rounded-lg"
            />
          </div>
        ) : content ? (
          <pre className="text-sm text-[var(--text-secondary)] whitespace-pre-wrap font-mono leading-relaxed">
            {content}
          </pre>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <File className="w-8 h-8 text-[var(--text-muted)] mb-2 opacity-40" />
            <p className="text-sm text-[var(--text-muted)]">Preview not available</p>
            <button
              onClick={onDownload}
              className="mt-3 flex items-center gap-1.5 text-sm text-[var(--color-teal,#00AFB9)] hover:underline"
            >
              <Download className="w-3.5 h-3.5" />
              Download file
            </button>
          </div>
        )}
      </div>

      {/* Comment thread stub — will connect when CommentThread component lands */}
      {/* <CommentThread projectId={projectId} entityType="document" entityId={doc.id} className="border-t border-white/[0.06] pt-4 mt-4" /> */}
    </div>
  );
}

// --------------------------------------------------------------------------
// DocumentsPage
// --------------------------------------------------------------------------

export function DocumentsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [docs, setDocs] = useState<DocEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const [selectedDoc, setSelectedDoc] = useState<DocEntry | null>(null);
  const [previewContent, setPreviewContent] = useState<string>("");
  const [previewLoading, setPreviewLoading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ------------------------------------------------------------------
  // Fetch documents list
  // ------------------------------------------------------------------

  const fetchDocs = useCallback(async () => {
    if (!projectId) return;
    try {
      const data = await api.get<DocEntry[]>(`/projects/${projectId}/documents`);
      setDocs(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load documents";
      toast(message, "error");
    } finally {
      setLoading(false);
    }
  }, [projectId, toast]);

  useEffect(() => {
    fetchDocs();
  }, [fetchDocs]);

  // ------------------------------------------------------------------
  // Select a document and load its preview content
  // ------------------------------------------------------------------

  const selectDoc = useCallback(
    async (doc: DocEntry) => {
      setSelectedDoc(doc);
      setPreviewContent("");
      if (doc.mime_type?.startsWith("image/")) return; // images render inline, no text needed

      setPreviewLoading(true);
      try {
        const data = await api.get<{ content?: string; text?: string }>(
          `/projects/${projectId}/documents/${doc.id}`,
        );
        setPreviewContent(data.content || data.text || "");
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to load content";
        setPreviewContent(`Error loading content: ${message}`);
      } finally {
        setPreviewLoading(false);
      }
    },
    [projectId],
  );

  // ------------------------------------------------------------------
  // Upload
  // ------------------------------------------------------------------

  const uploadFile = useCallback(
    async (file: File) => {
      if (!projectId) return;
      setUploading(true);
      try {
        const form = new FormData();
        form.append("file", file);
        const token = localStorage.getItem("bh-token");
        const res = await fetch(`/api/projects/${projectId}/documents/upload`, {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: form,
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ detail: "Upload failed" }));
          throw new Error(err.detail || "Upload failed");
        }
        toast("Document uploaded", "success");
        await fetchDocs();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Upload failed";
        toast(message, "error");
      } finally {
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [projectId, toast, fetchDocs],
  );

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
  };

  // ------------------------------------------------------------------
  // Drag-and-drop handlers
  // ------------------------------------------------------------------

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    // Only clear if we're leaving the page container itself
    if (e.currentTarget === e.target || !e.currentTarget.contains(e.relatedTarget as Node)) {
      setDragOver(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file);
  };

  // ------------------------------------------------------------------
  // Download
  // ------------------------------------------------------------------

  const handleDownload = useCallback(
    (doc: DocEntry) => {
      if (!projectId) return;
      downloadFile(projectId, doc, () => toast("Download failed", "error"));
    },
    [projectId, toast],
  );

  // ------------------------------------------------------------------
  // Delete (no backend endpoint yet — show helpful toast)
  // ------------------------------------------------------------------

  const handleDelete = useCallback(
    (_doc: DocEntry) => {
      toast("Delete not yet available", "info");
    },
    [toast],
  );

  // ------------------------------------------------------------------
  // Ask Claude
  // ------------------------------------------------------------------

  const handleAskClaude = useCallback(() => {
    if (!selectedDoc || !projectId) return;
    navigate(`/projects/${projectId}/chat`);
    // Copy a helpful prompt to clipboard so user can paste into chat
    const prompt = `Summarize this document: ${selectedDoc.filename}`;
    navigator.clipboard.writeText(prompt).catch(() => {});
    toast(`Opening chat — paste to ask about "${selectedDoc.filename}"`, "info");
  }, [selectedDoc, projectId, navigate, toast]);

  // ------------------------------------------------------------------
  // Loading state
  // ------------------------------------------------------------------

  if (loading) return <PageLoading />;

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  return (
    <div
      className={[
        "flex flex-col gap-6 min-h-full transition-all duration-150",
        dragOver ? "ring-2 ring-[var(--color-teal,#00AFB9)]/40 ring-inset rounded-xl" : "",
      ].join(" ")}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Page header */}
      <PageHeader
        title="Documents"
        description="Upload documents to your project's knowledge base."
        action={
          <label className="cursor-pointer">
            <span
              className={[
                "inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium transition-all",
                "bg-[var(--color-teal,#00AFB9)] hover:brightness-110",
                uploading ? "opacity-70 pointer-events-none" : "",
              ].join(" ")}
            >
              {uploading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Upload className="w-4 h-4" />
              )}
              {uploading ? "Uploading…" : "Upload"}
            </span>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleFileInput}
              accept=".txt,.md,.json,.yaml,.yml,.csv,.py,.ts,.tsx,.js,.jsx,.html,.css,.toml,.cfg,.ini,.xml,.sql,.sh,.bat,.ps1,.log,.docx,.doc,.png,.jpg,.jpeg,.gif,.webp,.svg"
              disabled={uploading}
            />
          </label>
        }
      />

      {/* Drag hint banner */}
      {dragOver && (
        <div className="flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-[var(--color-teal,#00AFB9)]/50 bg-[var(--color-teal,#00AFB9)]/5 text-sm text-[var(--color-teal,#00AFB9)] font-medium">
          <Upload className="w-4 h-4" />
          Drop file to upload
        </div>
      )}

      {/* Two-pane layout */}
      {docs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-14 h-14 rounded-2xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center mb-4">
            <FileText className="w-7 h-7 text-[var(--text-muted)]" />
          </div>
          <p className="text-[var(--text-secondary)] font-medium mb-1">No documents yet</p>
          <p className="text-sm text-[var(--text-muted)] mb-4 max-w-xs">
            Upload text files, DOCX, or images to store them in your project's knowledge base.
          </p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="w-4 h-4" />
            Upload a document
          </Button>
        </div>
      ) : (
        <div className="flex gap-4 flex-col sm:flex-row flex-1 min-h-0">
          {/* ---- LEFT: file list (40%) ---- */}
          <div className="sm:w-[40%] shrink-0 flex flex-col gap-1 overflow-y-auto">
            <p className="text-xs text-[var(--text-muted)] uppercase tracking-wide font-medium px-3 mb-1">
              {docs.length} {docs.length === 1 ? "file" : "files"}
            </p>
            {docs.map((doc) => (
              <DocListItem
                key={doc.id}
                doc={doc}
                selected={selectedDoc?.id === doc.id}
                onSelect={() => selectDoc(doc)}
                onDownload={() => handleDownload(doc)}
                onDelete={() => handleDelete(doc)}
              />
            ))}
          </div>

          {/* ---- RIGHT: preview pane (fills rest) ---- */}
          <PreviewPane
            doc={selectedDoc}
            projectId={projectId ?? ""}
            content={previewContent}
            loadingContent={previewLoading}
            onDownload={() => selectedDoc && handleDownload(selectedDoc)}
            onAskClaude={handleAskClaude}
          />
        </div>
      )}
    </div>
  );
}
