import React, { useState, useEffect, useCallback, useRef } from "react";
import { Trash2, Send, MessageCircle } from "lucide-react";
import { api } from "../../lib/api";
import { useAuth } from "../../contexts/AuthContext";
import { cn, relativeTime } from "../../lib/utils";
import type { Comment } from "../../types";

interface Props {
  projectId: string;
  entityType: string;
  entityId: string;
  className?: string;
}

export function CommentThread({
  projectId,
  entityType,
  entityId,
  className = "",
}: Props) {
  const { user } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const fetchComments = useCallback(async () => {
    try {
      const data = await api.comments.list(projectId, entityType, entityId);
      setComments(data);
    } catch {
      // silent — no toast for background list failures
    }
  }, [projectId, entityType, entityId]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  // Auto-grow textarea
  const handleBodyChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setBody(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };

  const handleSubmit = async () => {
    if (!body.trim() || submitting) return;
    setSubmitting(true);
    try {
      const comment = await api.comments.create(projectId, {
        entity_type: entityType,
        entity_id: entityId,
        body: body.trim(),
      });
      // Patch author_name optimistically from local user state
      setComments((prev) => [
        ...prev,
        {
          ...comment,
          author_name: comment.author_name ?? user?.display_name ?? "You",
        },
      ]);
      setBody("");
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    } catch {
      // noop — could wire toast here if desired
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (commentId: string) => {
    try {
      await api.comments.delete(projectId, commentId);
      setComments((prev) => prev.filter((c) => c.id !== commentId));
    } catch {
      // noop
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const getInitial = (name: string | null) => {
    if (!name) return "?";
    return name.trim()[0]?.toUpperCase() ?? "?";
  };

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {/* Comment list */}
      {comments.length === 0 ? (
        <div className="flex items-center justify-center gap-1.5 py-3">
          <MessageCircle className="w-3.5 h-3.5 text-gray-600" />
          <span className="text-xs text-gray-600">No comments yet</span>
        </div>
      ) : (
        <ul className="flex flex-col gap-4">
          {comments.map((comment) => {
            const isOwner = !!user && user.id === comment.author_id;
            return (
              <li key={comment.id} className="group flex gap-3 items-start">
                {/* Avatar */}
                <div className="flex-shrink-0 w-7 h-7 rounded-full bg-gradient-to-br from-teal to-coral flex items-center justify-center text-white text-xs font-bold select-none">
                  {getInitial(comment.author_name)}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-medium text-gray-200 truncate">
                      {comment.author_name ?? "Unknown"}
                    </span>
                    <span className="text-xs text-gray-500 flex-shrink-0">
                      {relativeTime(comment.created_at)}
                    </span>
                  </div>
                  <p className="text-sm text-gray-300 whitespace-pre-wrap break-words mt-0.5">
                    {comment.body}
                  </p>
                </div>

                {/* Delete button — only for author, revealed on hover */}
                {isOwner && (
                  <button
                    onClick={() => handleDelete(comment.id)}
                    className="flex-shrink-0 mt-0.5 p-1 rounded text-gray-600 hover:text-red-400 hover:bg-red-400/10 transition-all duration-150 opacity-0 group-hover:opacity-100 focus:opacity-100"
                    title="Delete comment"
                    type="button"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* Input area */}
      <div className="flex gap-2 items-end">
        {/* Current user avatar */}
        <div className="flex-shrink-0 w-7 h-7 rounded-full bg-gradient-to-br from-teal to-coral flex items-center justify-center text-white text-xs font-bold select-none">
          {getInitial(user?.display_name ?? null)}
        </div>

        <div className="flex-1 flex items-end gap-2 bg-white/[0.03] border border-white/[0.08] rounded-lg px-3 py-2 focus-within:border-white/[0.15] transition-colors duration-150">
          <textarea
            ref={textareaRef}
            value={body}
            onChange={handleBodyChange}
            onKeyDown={handleKeyDown}
            placeholder="Add a comment... (@ to mention)"
            rows={1}
            className="flex-1 bg-transparent text-sm text-gray-200 placeholder-gray-600 resize-none outline-none leading-relaxed min-h-[20px] max-h-40 overflow-y-auto"
          />
          <button
            onClick={handleSubmit}
            disabled={!body.trim() || submitting}
            className="flex-shrink-0 p-1 rounded text-gray-500 hover:text-teal disabled:opacity-30 disabled:cursor-not-allowed transition-colors duration-150"
            title="Send comment (Enter)"
            type="button"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
