import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Search,
  X,
  Lightbulb,
  CheckSquare,
  Cpu,
  BookOpen,
  ScrollText,
  Loader2,
} from "lucide-react";
import { api } from "../../lib/api";

interface SearchResult {
  type: "idea" | "task" | "component" | "rule" | "document";
  id: string;
  title: string;
  subtitle?: string;
}

interface SearchResponse {
  results: SearchResult[];
  count: number;
}

const TYPE_META: Record<
  SearchResult["type"],
  { label: string; icon: React.ReactNode; path: string; color: string }
> = {
  idea: {
    label: "Idea",
    icon: <Lightbulb className="w-3.5 h-3.5" />,
    path: "ideas",
    color: "text-amber-400",
  },
  task: {
    label: "Task",
    icon: <CheckSquare className="w-3.5 h-3.5" />,
    path: "tasks",
    color: "text-teal-400",
  },
  component: {
    label: "Component",
    icon: <Cpu className="w-3.5 h-3.5" />,
    path: "canvas",
    color: "text-violet-400",
  },
  rule: {
    label: "Rule",
    icon: <ScrollText className="w-3.5 h-3.5" />,
    path: "rules",
    color: "text-rose-400",
  },
  document: {
    label: "Document",
    icon: <BookOpen className="w-3.5 h-3.5" />,
    path: "documents",
    color: "text-sky-400",
  },
};

interface Props {
  open: boolean;
  onClose: () => void;
}

export function SearchModal({ open, onClose }: Props) {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Focus input when modal opens
  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Debounced search
  useEffect(() => {
    if (!open || !projectId || query.trim().length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const data = await api.search(projectId, query.trim());
        setResults(data.results as SearchResult[]);
        setActiveIndex(0);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, projectId, open]);

  const navigate_to = useCallback(
    (result: SearchResult) => {
      if (!projectId) return;
      const meta = TYPE_META[result.type];
      navigate(`/projects/${projectId}/${meta.path}`);
      onClose();
    },
    [projectId, navigate, onClose],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, results.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && results[activeIndex]) {
        navigate_to(results[activeIndex]);
      }
    },
    [results, activeIndex, navigate_to, onClose],
  );

  if (!open) return null;

  const grouped = results.reduce(
    (acc, r) => {
      if (!acc[r.type]) acc[r.type] = [];
      acc[r.type].push(r);
      return acc;
    },
    {} as Record<string, SearchResult[]>,
  );

  // Flat ordered list for keyboard nav
  const orderedTypes = (
    ["idea", "task", "component", "rule", "document"] as const
  ).filter((t) => grouped[t]?.length);

  let flatIdx = 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="relative w-full max-w-xl mx-4 rounded-2xl border border-white/[0.08] bg-gray-950/95 backdrop-blur-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-white/[0.06]">
          {loading ? (
            <Loader2 className="w-4 h-4 text-gray-400 shrink-0 animate-spin" />
          ) : (
            <Search className="w-4 h-4 text-gray-400 shrink-0" />
          )}
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search ideas, tasks, components, rules..."
            className="flex-1 bg-transparent text-sm text-gray-100 placeholder-gray-500 outline-none"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="p-0.5 text-gray-500 hover:text-gray-300 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <kbd className="hidden sm:flex items-center gap-0.5 px-1.5 py-0.5 rounded border border-white/[0.08] text-[10px] text-gray-500 font-mono">
            ESC
          </kbd>
        </div>

        {/* Results */}
        {results.length > 0 && (
          <div className="max-h-[60vh] overflow-y-auto py-2">
            {orderedTypes.map((type) => {
              const meta = TYPE_META[type];
              return (
                <div key={type} className="mb-1">
                  <div className="px-4 py-1 text-[10px] font-medium uppercase tracking-wider text-gray-500">
                    {meta.label}s
                  </div>
                  {grouped[type].map((result) => {
                    const isActive = flatIdx === activeIndex;
                    const currentIdx = flatIdx++;
                    return (
                      <button
                        key={result.id}
                        onClick={() => navigate_to(result)}
                        onMouseEnter={() => setActiveIndex(currentIdx)}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                          isActive ? "bg-white/[0.06]" : "hover:bg-white/[0.03]"
                        }`}
                      >
                        <span className={`shrink-0 ${meta.color}`}>
                          {meta.icon}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-gray-200 truncate">
                            {result.title}
                          </div>
                          {result.subtitle && (
                            <div className="text-xs text-gray-500 truncate capitalize">
                              {result.subtitle}
                            </div>
                          )}
                        </div>
                        {isActive && (
                          <kbd className="shrink-0 hidden sm:flex items-center gap-0.5 px-1.5 py-0.5 rounded border border-white/[0.08] text-[10px] text-gray-500 font-mono">
                            ↵
                          </kbd>
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}

        {/* Empty state when query has ≥2 chars but no results */}
        {!loading && query.trim().length >= 2 && results.length === 0 && (
          <div className="py-10 text-center text-sm text-gray-500">
            No results for &ldquo;{query}&rdquo;
          </div>
        )}

        {/* Hint when no query */}
        {query.trim().length === 0 && (
          <div className="py-6 text-center text-xs text-gray-600">
            Type at least 2 characters to search
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center gap-4 px-4 py-2 border-t border-white/[0.06] text-[10px] text-gray-600">
          <span>
            <kbd className="font-mono">↑↓</kbd> navigate
          </span>
          <span>
            <kbd className="font-mono">↵</kbd> open
          </span>
          <span>
            <kbd className="font-mono">ESC</kbd> close
          </span>
        </div>
      </div>
    </div>
  );
}
