import React, { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import {
  BookOpen,
  Plus,
  Shield,
  AlertTriangle,
  Info,
  ChevronDown,
  ChevronUp,
  X,
  AlertCircle,
  CheckCircle,
  Clock,
  Edit2,
} from "lucide-react";
import { api } from "../lib/api";
import type { BusinessRule, RuleEnforcement, RuleScope } from "../types";

const SCOPE_LABELS: Record<RuleScope, string> = {
  architecture: "Architecture",
  compliance: "Compliance",
  security: "Security",
  financial: "Financial",
  operational: "Operational",
  coding: "Coding",
};

const ENFORCEMENT_CONFIG: Record<
  RuleEnforcement,
  { label: string; color: string; icon: React.ElementType }
> = {
  mandatory: {
    label: "Mandatory",
    color: "text-rose-400 bg-rose-500/10 border-rose-500/20",
    icon: Shield,
  },
  recommended: {
    label: "Recommended",
    color: "text-amber-400 bg-amber-500/10 border-amber-500/20",
    icon: AlertTriangle,
  },
  advisory: {
    label: "Advisory",
    color: "text-zinc-400 bg-zinc-500/10 border-zinc-500/20",
    icon: Info,
  },
};

const SCOPE_COLORS: Record<RuleScope, string> = {
  architecture: "text-violet-400 bg-violet-500/10",
  compliance: "text-teal-400 bg-teal-500/10",
  security: "text-rose-400 bg-rose-500/10",
  financial: "text-emerald-400 bg-emerald-500/10",
  operational: "text-blue-400 bg-blue-500/10",
  coding: "text-amber-400 bg-amber-500/10",
};

interface CreateRuleModalProps {
  projectId: string;
  onCreated: (rule: BusinessRule) => void;
  onClose: () => void;
}

function CreateRuleModal({
  projectId,
  onCreated,
  onClose,
}: CreateRuleModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [rationale, setRationale] = useState("");
  const [enforcement, setEnforcement] =
    useState<RuleEnforcement>("recommended");
  const [scope, setScope] = useState<RuleScope>("architecture");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const rule = await api.rules.create(projectId, {
        title: title.trim(),
        description: description.trim(),
        rationale: rationale.trim() || undefined,
        enforcement,
        scope,
      });
      onCreated(rule);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create rule");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-[#1e1b2e] border border-white/[0.1] rounded-xl p-6 w-full max-w-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-zinc-100">
            New Business Rule
          </h2>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-300"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            autoFocus
            type="text"
            placeholder="Rule title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-teal-500/50"
          />

          <textarea
            placeholder="Description — what this rule requires"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-teal-500/50 resize-none"
          />

          <textarea
            placeholder="Rationale — why this rule exists (optional)"
            value={rationale}
            onChange={(e) => setRationale(e.target.value)}
            rows={2}
            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-teal-500/50 resize-none"
          />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-zinc-500 uppercase tracking-wide mb-1 block">
                Enforcement
              </label>
              <select
                value={enforcement}
                onChange={(e) =>
                  setEnforcement(e.target.value as RuleEnforcement)
                }
                className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-teal-500/50"
              >
                <option value="mandatory">Mandatory</option>
                <option value="recommended">Recommended</option>
                <option value="advisory">Advisory</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-zinc-500 uppercase tracking-wide mb-1 block">
                Scope
              </label>
              <select
                value={scope}
                onChange={(e) => setScope(e.target.value as RuleScope)}
                className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-teal-500/50"
              >
                {(Object.keys(SCOPE_LABELS) as RuleScope[]).map((s) => (
                  <option key={s} value={s}>
                    {SCOPE_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {error && (
            <p className="text-sm text-rose-400 flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5" />
              {error}
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 text-sm rounded-lg border border-white/[0.08] text-zinc-400 hover:bg-white/[0.04] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim() || !description.trim() || saving}
              className="flex-1 py-2 text-sm rounded-lg bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white font-medium transition-colors"
            >
              {saving ? "Creating…" : "Create Rule"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface RuleCardProps {
  rule: BusinessRule;
  onDeactivate: (id: string) => void;
}

function RuleCard({ rule, onDeactivate }: RuleCardProps) {
  const [expanded, setExpanded] = useState(false);
  const ef = ENFORCEMENT_CONFIG[rule.enforcement];
  const EnfIcon = ef.icon;

  return (
    <div className="bg-[#1e1b2e] border border-white/[0.08] rounded-xl overflow-hidden hover:border-white/[0.12] transition-colors">
      <div
        className="flex items-start gap-3 p-4 cursor-pointer"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className={`mt-0.5 p-1.5 rounded border ${ef.color}`}>
          <EnfIcon className="w-3.5 h-3.5" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-zinc-100">
              {rule.title}
            </span>
            {rule.version > 1 && (
              <span className="text-xs text-zinc-600">v{rule.version}</span>
            )}
            <span
              className={`text-xs px-1.5 py-0.5 rounded font-medium ${SCOPE_COLORS[rule.scope]}`}
            >
              {SCOPE_LABELS[rule.scope]}
            </span>
            <span
              className={`text-xs px-1.5 py-0.5 rounded border ${ef.color}`}
            >
              {ef.label}
            </span>
          </div>
          <p className="text-xs text-zinc-500 mt-1 line-clamp-2">
            {rule.description}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDeactivate(rule.id);
            }}
            className="text-zinc-600 hover:text-rose-400 transition-colors opacity-0 group-hover:opacity-100"
          >
            <X className="w-3.5 h-3.5" />
          </button>
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-zinc-600" />
          ) : (
            <ChevronDown className="w-4 h-4 text-zinc-600" />
          )}
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-white/[0.06] pt-3">
          <p className="text-sm text-zinc-300 leading-relaxed">
            {rule.description}
          </p>
          {rule.rationale && (
            <div className="bg-white/[0.03] rounded-lg p-3">
              <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1">
                Rationale
              </p>
              <p className="text-sm text-zinc-400">{rule.rationale}</p>
            </div>
          )}
          <div className="flex items-center justify-between text-xs text-zinc-600">
            <span>
              {new Date(rule.created_at).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </span>
            <button
              onClick={() => onDeactivate(rule.id)}
              className="text-zinc-600 hover:text-rose-400 transition-colors flex items-center gap-1"
            >
              <X className="w-3 h-3" /> Deactivate
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function RulesPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [rules, setRules] = useState<BusinessRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterScope, setFilterScope] = useState<RuleScope | "">("");
  const [filterEnforcement, setFilterEnforcement] = useState<
    RuleEnforcement | ""
  >("");
  const [showCreate, setShowCreate] = useState(false);

  const fetchRules = useCallback(async () => {
    if (!projectId) return;
    try {
      const data = await api.rules.list(projectId);
      setRules(data);
    } catch (err) {
      console.error("Failed to fetch rules", err);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  const handleDeactivate = useCallback(
    async (ruleId: string) => {
      if (!projectId) return;
      try {
        await api.rules.deactivate(projectId, ruleId);
        setRules((prev) => prev.filter((r) => r.id !== ruleId));
      } catch (err) {
        console.error("Failed to deactivate rule", err);
      }
    },
    [projectId],
  );

  const filtered = rules.filter((r) => {
    if (filterScope && r.scope !== filterScope) return false;
    if (filterEnforcement && r.enforcement !== filterEnforcement) return false;
    return true;
  });

  // Group by scope
  const grouped = (Object.keys(SCOPE_LABELS) as RuleScope[]).reduce<
    Record<string, BusinessRule[]>
  >((acc, s) => {
    const group = filtered.filter((r) => r.scope === s);
    if (group.length > 0) acc[s] = group;
    return acc;
  }, {});

  const mandatoryCount = rules.filter(
    (r) => r.enforcement === "mandatory",
  ).length;
  const recommendedCount = rules.filter(
    (r) => r.enforcement === "recommended",
  ).length;

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100 flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-teal-400" />
            Business Rules
          </h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            {rules.length} active rule{rules.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 hover:bg-teal-500 text-white text-sm rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Rule
        </button>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-[#1e1b2e] border border-white/[0.08] rounded-xl p-4">
          <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1">
            Total Active
          </p>
          <p className="text-3xl font-light text-zinc-100">{rules.length}</p>
        </div>
        <div className="bg-[#1e1b2e] border border-white/[0.08] rounded-xl p-4">
          <p className="text-xs text-rose-400 uppercase tracking-wide mb-1 flex items-center gap-1">
            <Shield className="w-3 h-3" /> Mandatory
          </p>
          <p className="text-3xl font-light text-zinc-100">{mandatoryCount}</p>
        </div>
        <div className="bg-[#1e1b2e] border border-white/[0.08] rounded-xl p-4">
          <p className="text-xs text-amber-400 uppercase tracking-wide mb-1 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> Recommended
          </p>
          <p className="text-3xl font-light text-zinc-100">
            {recommendedCount}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2">
        <select
          value={filterScope}
          onChange={(e) => setFilterScope(e.target.value as RuleScope | "")}
          className="bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-1.5 text-xs text-zinc-400 focus:outline-none"
        >
          <option value="">All Scopes</option>
          {(Object.entries(SCOPE_LABELS) as [RuleScope, string][]).map(
            ([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ),
          )}
        </select>
        <select
          value={filterEnforcement}
          onChange={(e) =>
            setFilterEnforcement(e.target.value as RuleEnforcement | "")
          }
          className="bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-1.5 text-xs text-zinc-400 focus:outline-none"
        >
          <option value="">All Enforcement</option>
          <option value="mandatory">Mandatory</option>
          <option value="recommended">Recommended</option>
          <option value="advisory">Advisory</option>
        </select>
      </div>

      {/* Rule groups */}
      {loading ? (
        <div className="flex items-center justify-center h-32">
          <Clock className="w-5 h-5 text-zinc-600 animate-spin" />
        </div>
      ) : Object.keys(grouped).length === 0 ? (
        <div className="text-center py-16">
          <BookOpen className="w-8 h-8 text-zinc-700 mx-auto mb-3" />
          <p className="text-zinc-500">No rules yet</p>
          <p className="text-zinc-600 text-sm mt-1">
            Business rules define how your project must behave.
          </p>
          <button
            onClick={() => setShowCreate(true)}
            className="mt-4 px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white text-sm rounded-lg transition-colors"
          >
            Create First Rule
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {(Object.entries(grouped) as [RuleScope, BusinessRule[]][]).map(
            ([scope, scopeRules]) => (
              <div key={scope}>
                <div className="flex items-center gap-2 mb-3">
                  <span
                    className={`text-xs px-2 py-0.5 rounded font-medium ${SCOPE_COLORS[scope]}`}
                  >
                    {SCOPE_LABELS[scope]}
                  </span>
                  <span className="text-xs text-zinc-600">
                    {scopeRules.length} rule{scopeRules.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <div className="space-y-2 group">
                  {scopeRules.map((rule) => (
                    <RuleCard
                      key={rule.id}
                      rule={rule}
                      onDeactivate={handleDeactivate}
                    />
                  ))}
                </div>
              </div>
            ),
          )}
        </div>
      )}

      {showCreate && projectId && (
        <CreateRuleModal
          projectId={projectId}
          onCreated={(rule) => {
            setRules((prev) => [rule, ...prev]);
            setShowCreate(false);
          }}
          onClose={() => setShowCreate(false)}
        />
      )}
    </div>
  );
}
