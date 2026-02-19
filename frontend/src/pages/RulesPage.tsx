import React, { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { BookOpen, Search, Pin, PinOff } from "lucide-react";
import { api } from "../lib/api";
import { useToast } from "../contexts/ToastContext";
import { Button } from "../components/common/Button";
import { Card } from "../components/common/Card";
import { PageHeader } from "../components/common/PageHeader";
import { PageLoading } from "../components/common/LoadingSpinner";
import { Input } from "../components/common/Input";
import { EmptyState } from "../components/common/EmptyState";

interface RecallMemory {
  id: string;
  content: string;
  domain: string | null;
  tags: string[];
  importance: number | null;
  pinned: boolean;
  created_at: string | null;
}

export function RulesPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { toast } = useToast();

  const [rules, setRules] = useState<RecallMemory[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<RecallMemory[]>([]);
  const [searching, setSearching] = useState(false);
  const [pinningId, setPinningId] = useState<string | null>(null);

  const fetchRules = useCallback(async () => {
    if (!projectId) return;

    try {
      const data = await api.get<RecallMemory[]>(
        `/projects/${projectId}/rules`,
      );
      setRules(data);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load rules";
      toast(message, "error");
    } finally {
      setLoading(false);
    }
  }, [projectId, toast]);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  const handleSearch = async () => {
    if (!projectId || !searchQuery.trim()) return;

    setSearching(true);
    try {
      const data = await api.post<RecallMemory[]>(
        `/projects/${projectId}/rules/search`,
        { query: searchQuery.trim(), limit: 20 },
      );
      setSearchResults(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Search failed";
      toast(message, "error");
    } finally {
      setSearching(false);
    }
  };

  const handlePin = async (memoryId: string) => {
    if (!projectId) return;

    setPinningId(memoryId);
    try {
      await api.post(`/projects/${projectId}/rules/pin`, {
        memory_id: memoryId,
      });
      toast("Rule pinned!", "success");
      setSearchResults((prev) =>
        prev.map((m) => (m.id === memoryId ? { ...m, pinned: true } : m)),
      );
      await fetchRules();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to pin rule";
      toast(message, "error");
    } finally {
      setPinningId(null);
    }
  };

  const handleUnpin = async (memoryId: string) => {
    if (!projectId) return;

    setPinningId(memoryId);
    try {
      await api.delete(`/projects/${projectId}/rules/${memoryId}/pin`);
      toast("Rule unpinned.", "success");
      setRules((prev) => prev.filter((r) => r.id !== memoryId));
      setSearchResults((prev) =>
        prev.map((m) => (m.id === memoryId ? { ...m, pinned: false } : m)),
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to unpin rule";
      toast(message, "error");
    } finally {
      setPinningId(null);
    }
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearch();
  };

  if (loading) {
    return <PageLoading />;
  }

  return (
    <div>
      <PageHeader
        title="Business Rules"
        description="Pin important memories from Recall as persistent project rules."
      />

      {/* Pinned Rules */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <Pin className="w-5 h-5 text-teal" />
          Pinned Rules
          <span className="text-sm font-normal text-gray-500 dark:text-gray-400">
            ({rules.length})
          </span>
        </h2>

        {rules.length === 0 ? (
          <EmptyState
            icon={<BookOpen className="w-12 h-12" />}
            title="No pinned rules"
            description="Search Recall below and pin important memories as business rules for this project."
          />
        ) : (
          <div className="space-y-3">
            {rules.map((rule) => (
              <Card key={rule.id}>
                <div className="flex items-start gap-3">
                  <BookOpen className="w-4 h-4 mt-1 text-teal shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-900 dark:text-white whitespace-pre-wrap">
                      {rule.content}
                    </p>
                    {rule.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {rule.tags.map((tag) => (
                          <span
                            key={tag}
                            className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    loading={pinningId === rule.id}
                    onClick={() => handleUnpin(rule.id)}
                    title="Unpin rule"
                  >
                    <PinOff className="w-4 h-4" />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Search Recall */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <Search className="w-5 h-5" />
          Search Recall
        </h2>

        <div className="flex gap-2 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="Search memories..."
              className="pl-9"
            />
          </div>
          <Button onClick={handleSearch} loading={searching}>
            Search
          </Button>
        </div>

        {searchResults.length > 0 && (
          <div className="space-y-3">
            {searchResults.map((memory) => (
              <Card key={memory.id}>
                <div className="flex items-start gap-3">
                  <BookOpen className="w-4 h-4 mt-1 text-gray-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-900 dark:text-white whitespace-pre-wrap">
                      {memory.content}
                    </p>
                    {memory.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {memory.tags.map((tag) => (
                          <span
                            key={tag}
                            className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                    {memory.domain && (
                      <span className="text-xs text-gray-400 dark:text-gray-500 mt-1 inline-block">
                        {memory.domain}
                      </span>
                    )}
                  </div>
                  <Button
                    variant={memory.pinned ? "ghost" : "secondary"}
                    size="sm"
                    loading={pinningId === memory.id}
                    disabled={memory.pinned}
                    onClick={() => handlePin(memory.id)}
                    title={memory.pinned ? "Already pinned" : "Pin as rule"}
                  >
                    <Pin className="w-4 h-4" />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
