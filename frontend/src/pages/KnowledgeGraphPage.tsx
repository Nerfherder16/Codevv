import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from "react";
import mermaid from "mermaid";
import { useParams, useNavigate } from "react-router-dom";
import {
  Plus,
  ArrowLeft,
  Search,
  Network,
  GitBranch,
  Trash2,
  Filter,
} from "lucide-react";
import { api } from "../lib/api";
import type {
  KnowledgeEntity,
  KnowledgeRelation,
  GraphData,
  GraphNode,
  GraphEdge,
} from "../types";
import { useToast } from "../contexts/ToastContext";
import { Button } from "../components/common/Button";
import { Card } from "../components/common/Card";
import { PageHeader } from "../components/common/PageHeader";
import { PageLoading } from "../components/common/LoadingSpinner";
import { Modal } from "../components/common/Modal";
import { Input, Select } from "../components/common/Input";
import { EmptyState, GraphIllustration } from "../components/common/EmptyState";
import { relativeTime } from "../lib/utils";

const RELATION_TYPES = [
  "depends_on",
  "uses",
  "implements",
  "relates_to",
  "authenticates",
  "manages",
  "feeds",
  "propagates_to",
  "reads",
  "stores",
  "processes",
] as const;

const entityTypeColors: Record<string, string> = {
  concept: "#8b5cf6", // violet
  technology: "#3b82f6", // blue
  decision: "#F07167", // coral
  component: "#10b981", // emerald
  service: "#38bdf8", // cyan
  infrastructure: "#f59e0b", // amber
  idea: "#f472b6", // rose
  feature: "#a78bfa", // light violet
  module: "#06b6d4", // dark cyan
  api: "#22d3ee", // teal
  database: "#fb923c", // orange
  person: "#34d399", // light emerald
  process: "#e879f9", // fuchsia
};

const entityTypeBadge: Record<string, string> = {
  concept:
    "bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300",
  technology:
    "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300",
  decision: "bg-coral/10 text-coral",
  component:
    "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300",
  service: "bg-cyan-100 dark:bg-cyan-900/40 text-cyan-700 dark:text-cyan-300",
  infrastructure:
    "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300",
  idea: "bg-pink-100 dark:bg-pink-900/40 text-pink-700 dark:text-pink-300",
  feature:
    "bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300",
  module: "bg-cyan-100 dark:bg-cyan-900/40 text-cyan-700 dark:text-cyan-300",
  api: "bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300",
  database:
    "bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300",
  person:
    "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300",
  process:
    "bg-fuchsia-100 dark:bg-fuchsia-900/40 text-fuchsia-700 dark:text-fuchsia-300",
};

/* ---------- Mermaid Generator ---------- */

function generateMermaid(nodes: GraphNode[], edges: GraphEdge[]): string {
  if (nodes.length === 0) return "graph TD\n  empty[No data - click Show All]";
  const lines = ["graph TD"];
  const nodeIdMap = new Map<string, string>();

  nodes.forEach((n, i) => {
    const sid = `N${i}`;
    nodeIdMap.set(n.id, sid);
    // Sanitize name for mermaid (remove special chars that break syntax)
    const safeName = n.name.replace(/[[\](){}|#&;`"]/g, " ").trim();
    let shape: string;
    switch (n.entity_type) {
      case "database":
        shape = `[(${safeName})]`;
        break;
      case "service":
      case "api":
      case "infrastructure":
        shape = `{{${safeName}}}`;
        break;
      case "smart_contract":
      case "security":
        shape = `[/${safeName}\\]`;
        break;
      default:
        shape = `[${safeName}]`;
    }
    lines.push(`  ${sid}${shape}`);
  });

  edges.forEach((e) => {
    const src = nodeIdMap.get(e.source);
    const tgt = nodeIdMap.get(e.target);
    if (src && tgt) {
      lines.push(`  ${src} -->|${e.relation_type}| ${tgt}`);
    }
  });

  return lines.join("\n");
}

/* ---------- Force Graph Component ---------- */

interface ForceNode {
  id: string;
  name: string;
  entity_type: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface ForceEdge {
  source: string;
  target: string;
  relation_type: string;
}

function ForceGraph({
  nodes: rawNodes,
  edges,
  width,
  height,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  width: number;
  height: number;
}) {
  const nodesRef = useRef<ForceNode[]>([]);
  const [renderTick, setRenderTick] = useState(0);
  const frameRef = useRef<number>(0);
  const [dragNode, setDragNode] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Initialize nodes with random positions spread across the canvas
  useEffect(() => {
    const existing = new Map(nodesRef.current.map((n) => [n.id, n]));
    const spread = Math.min(width, height) * 0.45;
    nodesRef.current = rawNodes.map((n) => {
      const prev = existing.get(n.id);
      if (prev) return { ...prev, name: n.name, entity_type: n.entity_type };
      return {
        id: n.id,
        name: n.name,
        entity_type: n.entity_type,
        x: width / 2 + (Math.random() - 0.5) * spread * 2,
        y: height / 2 + (Math.random() - 0.5) * spread * 2,
        vx: 0,
        vy: 0,
      };
    });
    setRenderTick((t) => t + 1);
  }, [rawNodes, width, height]);

  // Force simulation loop
  useEffect(() => {
    let running = true;
    let alpha = 1;

    function tick() {
      if (!running) return;

      const nodes = nodesRef.current;
      const damping = 0.9;
      alpha *= 0.995;

      if (alpha < 0.001) {
        frameRef.current = requestAnimationFrame(tick);
        return;
      }

      // Scale forces to canvas size so graph fills available space
      const canvasScale = Math.min(width, height);
      const nodeCount = nodes.length;
      const densityFactor = Math.max(1, nodeCount / 10);
      const repulsionStrength = canvasScale * densityFactor * 0.6;
      const edgeTargetLen = canvasScale * 0.2;

      // Repulsion between all nodes
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];
          let dx = b.x - a.x;
          let dy = b.y - a.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = (repulsionStrength * alpha) / (dist * dist);
          dx *= force;
          dy *= force;

          if (a.id !== dragNode) {
            a.vx -= dx;
            a.vy -= dy;
          }
          if (b.id !== dragNode) {
            b.vx += dx;
            b.vy += dy;
          }
        }
      }

      // Attraction along edges
      const nodeMap = new Map(nodes.map((n) => [n.id, n]));
      for (const edge of edges) {
        const a = nodeMap.get(edge.source);
        const b = nodeMap.get(edge.target);
        if (!a || !b) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = (dist - edgeTargetLen) * 0.02 * alpha;

        if (a.id !== dragNode) {
          a.vx += (dx / dist) * force;
          a.vy += (dy / dist) * force;
        }
        if (b.id !== dragNode) {
          b.vx -= (dx / dist) * force;
          b.vy -= (dy / dist) * force;
        }
      }

      // Center gravity (gentle)
      const cx = width / 2;
      const cy = height / 2;
      for (const n of nodes) {
        if (n.id === dragNode) continue;
        n.vx += (cx - n.x) * 0.001 * alpha;
        n.vy += (cy - n.y) * 0.001 * alpha;
        n.vx *= damping;
        n.vy *= damping;
        n.x += n.vx;
        n.y += n.vy;
        // Clamp to bounds
        n.x = Math.max(60, Math.min(width - 60, n.x));
        n.y = Math.max(40, Math.min(height - 40, n.y));
      }

      setRenderTick((t) => t + 1);
      frameRef.current = requestAnimationFrame(tick);
    }

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      running = false;
      cancelAnimationFrame(frameRef.current);
    };
  }, [edges, width, height, dragNode]);

  const nodeMap = useMemo(() => {
    void renderTick; // dependency
    return new Map(nodesRef.current.map((n) => [n.id, n]));
  }, [renderTick]);

  const handleMouseDown = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    setDragNode(id);
  };

  useEffect(() => {
    if (!dragNode) return;

    const handleMove = (e: MouseEvent) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const node = nodesRef.current.find((n) => n.id === dragNode);
      if (node) {
        node.x = e.clientX - rect.left;
        node.y = e.clientY - rect.top;
        node.vx = 0;
        node.vy = 0;
        setRenderTick((t) => t + 1);
      }
    };

    const handleUp = () => setDragNode(null);

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [dragNode]);

  if (nodesRef.current.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 dark:text-gray-500 text-sm">
        <div className="text-center">
          <Network className="w-10 h-10 mx-auto mb-2 opacity-50" />
          <p>Select a start node and traverse to see the graph</p>
        </div>
      </div>
    );
  }

  return (
    <svg
      ref={svgRef}
      width={width}
      height={height}
      className="bg-gray-50 dark:bg-gray-800/30 rounded-lg"
    >
      {/* Edges */}
      {edges.map((e, i) => {
        const a = nodeMap.get(e.source);
        const b = nodeMap.get(e.target);
        if (!a || !b) return null;
        return (
          <g key={`edge-${i}`}>
            <line
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke="#94a3b8"
              strokeWidth={1.5}
              strokeOpacity={0.5}
            />
            <text
              x={(a.x + b.x) / 2}
              y={(a.y + b.y) / 2 - 6}
              textAnchor="middle"
              fontSize={9}
              fill="#94a3b8"
            >
              {e.relation_type}
            </text>
          </g>
        );
      })}
      {/* Nodes */}
      {nodesRef.current.map((n) => (
        <g
          key={n.id}
          onMouseDown={handleMouseDown(n.id)}
          style={{ cursor: dragNode === n.id ? "grabbing" : "grab" }}
        >
          <circle
            cx={n.x}
            cy={n.y}
            r={18}
            fill={entityTypeColors[n.entity_type] || "#6b7280"}
            fillOpacity={0.8}
            stroke={entityTypeColors[n.entity_type] || "#6b7280"}
            strokeWidth={2}
          />
          <text
            x={n.x}
            y={n.y + 30}
            textAnchor="middle"
            fontSize={11}
            fontWeight={500}
            fill="currentColor"
            className="text-gray-700 dark:text-gray-300"
          >
            {n.name}
          </text>
        </g>
      ))}
    </svg>
  );
}

/* ---------- Mermaid Rendered Diagram ---------- */

mermaid.initialize({
  startOnLoad: false,
  theme: "dark",
  themeVariables: {
    primaryColor: "#1e1b2e",
    primaryBorderColor: "#38bdf8",
    primaryTextColor: "#e5e7eb",
    lineColor: "#94a3b8",
    secondaryColor: "#252236",
    tertiaryColor: "#2d2a3e",
  },
});

function MermaidDiagram({ definition }: { definition: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const renderCount = useRef(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    renderCount.current += 1;
    const id = `mermaid-diagram-${renderCount.current}`;

    // Remove any previous mermaid-generated elements
    el.innerHTML = "";

    mermaid
      .render(id, definition)
      .then(({ svg }) => {
        if (containerRef.current) {
          containerRef.current.innerHTML = svg;
        }
      })
      .catch(() => {
        // Fallback: show raw text if render fails
        if (containerRef.current) {
          const pre = document.createElement("pre");
          pre.className =
            "text-xs font-mono text-gray-400 whitespace-pre-wrap p-2";
          pre.textContent = definition;
          containerRef.current.innerHTML = "";
          containerRef.current.appendChild(pre);
        }
      });
  }, [definition]);

  return (
    <div
      ref={containerRef}
      className="flex-1 min-h-[400px] border border-gray-200 dark:border-gray-700 rounded-lg overflow-auto p-4 bg-gray-50 dark:bg-gray-800/30 [&_svg]:max-w-full [&_svg]:h-auto"
    />
  );
}

/* ---------- Main Page ---------- */

export function KnowledgeGraphPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [entities, setEntities] = useState<KnowledgeEntity[]>([]);
  const [relations, setRelations] = useState<KnowledgeRelation[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState("");

  // Add entity form
  const [addName, setAddName] = useState("");
  const [addType, setAddType] = useState<string>("concept");
  const [addDesc, setAddDesc] = useState("");
  const [addLoading, setAddLoading] = useState(false);

  // Relation modal
  const [relationModalOpen, setRelationModalOpen] = useState(false);
  const [relSourceId, setRelSourceId] = useState("");
  const [relTargetId, setRelTargetId] = useState("");
  const [relType, setRelType] = useState<string>(RELATION_TYPES[0]);
  const [relLoading, setRelLoading] = useState(false);

  // Graph state
  const [graphData, setGraphData] = useState<GraphData>({
    nodes: [],
    edges: [],
  });
  const [startNodeId, setStartNodeId] = useState("");
  const [graphLoading, setGraphLoading] = useState(false);

  // View mode (graph vs mermaid text)
  const [viewMode, setViewMode] = useState<"graph" | "mermaid">("graph");

  // Search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<KnowledgeEntity[] | null>(
    null,
  );
  const [searching, setSearching] = useState(false);

  // Graph container sizing
  const graphContainerRef = useRef<HTMLDivElement>(null);
  const [graphSize, setGraphSize] = useState({ width: 600, height: 500 });

  useEffect(() => {
    const el = graphContainerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setGraphSize({
          width: Math.floor(entry.contentRect.width),
          height: Math.floor(entry.contentRect.height),
        });
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const fetchEntities = useCallback(async () => {
    if (!projectId) return;
    try {
      const params = typeFilter ? `?entity_type=${typeFilter}` : "";
      const data = await api.get<KnowledgeEntity[]>(
        `/projects/${projectId}/knowledge/entities${params}`,
      );
      setEntities(data);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to load entities";
      toast(msg, "error");
    }
  }, [projectId, typeFilter, toast]);

  const fetchRelations = useCallback(async () => {
    if (!projectId) return;
    try {
      const data = await api.get<KnowledgeRelation[]>(
        `/projects/${projectId}/knowledge/relations`,
      );
      setRelations(data);
    } catch {
      // silent - relations are secondary
    }
  }, [projectId]);

  useEffect(() => {
    Promise.all([fetchEntities(), fetchRelations()]).finally(() =>
      setLoading(false),
    );
  }, [fetchEntities, fetchRelations]);

  const handleAddEntity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addName.trim()) {
      toast("Entity name is required.", "error");
      return;
    }

    setAddLoading(true);
    try {
      const entity = await api.post<KnowledgeEntity>(
        `/projects/${projectId}/knowledge/entities`,
        {
          name: addName.trim(),
          entity_type: addType,
          description: addDesc.trim() || null,
        },
      );
      setEntities((prev) => [entity, ...prev]);
      setAddName("");
      setAddDesc("");
      toast("Entity created!", "success");
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to create entity";
      toast(msg, "error");
    } finally {
      setAddLoading(false);
    }
  };

  const handleDeleteEntity = async (id: string) => {
    try {
      await api.delete(`/projects/${projectId}/knowledge/entities/${id}`);
      setEntities((prev) => prev.filter((e) => e.id !== id));
      toast("Entity deleted.", "success");
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to delete entity";
      toast(msg, "error");
    }
  };

  const handleAddRelation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!relSourceId || !relTargetId) {
      toast("Select source and target entities.", "error");
      return;
    }
    if (relSourceId === relTargetId) {
      toast("Source and target must be different.", "error");
      return;
    }

    setRelLoading(true);
    try {
      const rel = await api.post<KnowledgeRelation>(
        `/projects/${projectId}/knowledge/relations`,
        {
          source_id: relSourceId,
          target_id: relTargetId,
          relation_type: relType,
        },
      );
      setRelations((prev) => [rel, ...prev]);
      setRelationModalOpen(false);
      setRelSourceId("");
      setRelTargetId("");
      toast("Relation created!", "success");
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to create relation";
      toast(msg, "error");
    } finally {
      setRelLoading(false);
    }
  };

  const handleTraverse = async () => {
    if (!startNodeId) {
      toast("Select a start node.", "error");
      return;
    }
    setGraphLoading(true);
    try {
      const data = await api.post<GraphData>(
        `/projects/${projectId}/knowledge/traverse`,
        { start_id: startNodeId, max_depth: 3 },
      );
      // Deduplicate nodes (traversal returns same node at multiple depths)
      const seenNodes = new Map<string, GraphNode>();
      for (const node of data.nodes) {
        if (!seenNodes.has(node.id)) seenNodes.set(node.id, node);
      }
      const seenEdges = new Set<string>();
      const uniqueEdges = data.edges.filter((e) => {
        const key = `${e.source}-${e.relation_type}-${e.target}`;
        if (seenEdges.has(key)) return false;
        seenEdges.add(key);
        return true;
      });
      setGraphData({
        nodes: Array.from(seenNodes.values()),
        edges: uniqueEdges,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Traversal failed";
      toast(msg, "error");
    } finally {
      setGraphLoading(false);
    }
  };

  const handleShowAll = useCallback(() => {
    setGraphLoading(true);
    try {
      const graphNodes: GraphNode[] = entities.map((e) => ({
        id: e.id,
        name: e.name,
        entity_type: e.entity_type,
        depth: 0,
      }));
      const graphEdges: GraphEdge[] = relations
        .filter(
          (r) =>
            entities.some((e) => e.id === r.source_id) &&
            entities.some((e) => e.id === r.target_id),
        )
        .map((r) => ({
          source: r.source_id,
          target: r.target_id,
          relation_type: r.relation_type,
          weight: r.weight ?? null,
        }));
      setGraphData({ nodes: graphNodes, edges: graphEdges });
    } finally {
      setGraphLoading(false);
    }
  }, [entities, relations]);

  // Auto-load graph when entities/relations are fetched
  useEffect(() => {
    if (!loading && entities.length > 0 && graphData.nodes.length === 0) {
      handleShowAll();
    }
  }, [loading, entities.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setSearching(true);
    try {
      const results = await api.post<KnowledgeEntity[]>(
        `/projects/${projectId}/knowledge/search`,
        { query: searchQuery.trim() },
      );
      setSearchResults(results);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Search failed";
      toast(msg, "error");
    } finally {
      setSearching(false);
    }
  };

  // Derive entity types dynamically from actual data
  const entityTypes = useMemo(() => {
    const types = new Set(entities.map((e) => e.entity_type));
    return Array.from(types).sort();
  }, [entities]);

  // Types present in current graph (for legend)
  const graphEntityTypes = useMemo(() => {
    const types = new Set(graphData.nodes.map((n) => n.entity_type));
    return Array.from(types).sort();
  }, [graphData.nodes]);

  const displayedEntities = searchResults ?? entities;

  if (loading) {
    return <PageLoading />;
  }

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 7rem)" }}>
      <PageHeader
        title="Knowledge Graph"
        description="Map entities, relationships, and project knowledge."
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
            <Button size="sm" onClick={() => setRelationModalOpen(true)}>
              <GitBranch className="w-4 h-4" />
              Add Relation
            </Button>
          </div>
        }
      />

      <div className="flex-1 flex gap-4 min-h-0">
        {/* Left panel: entities */}
        <div className="w-80 shrink-0 flex flex-col gap-4">
          {/* Search */}
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  if (!e.target.value.trim()) setSearchResults(null);
                }}
                placeholder="Semantic search..."
                className="pl-9"
              />
            </div>
            <Button size="sm" type="submit" loading={searching}>
              <Search className="w-3.5 h-3.5" />
            </Button>
          </form>

          {/* Type filter */}
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400 shrink-0" />
            <Select
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value);
                setSearchResults(null);
              }}
              className="flex-1 px-2 py-1.5 text-xs"
            >
              <option value="">All types</option>
              {entityTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </div>

          {/* Entity list */}
          <div className="flex-1 overflow-y-auto space-y-2">
            {displayedEntities.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-6">
                {searchResults ? "No search results" : "No entities yet"}
              </p>
            ) : (
              displayedEntities.map((entity) => (
                <Card key={entity.id} className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                          {entity.name}
                        </p>
                        <span
                          className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ${entityTypeBadge[entity.entity_type] || "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"}`}
                        >
                          {entity.entity_type}
                        </span>
                      </div>
                      {entity.description && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                          {entity.description}
                        </p>
                      )}
                      <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">
                        {relativeTime(entity.created_at)}
                      </p>
                    </div>
                    <button
                      onClick={() => handleDeleteEntity(entity.id)}
                      className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500 shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </Card>
              ))
            )}
          </div>

          {/* Add entity form */}
          <Card className="p-3 shrink-0">
            <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2 uppercase tracking-wider">
              Add Entity
            </p>
            <form onSubmit={handleAddEntity} className="space-y-2">
              <Input
                type="text"
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                placeholder="Entity name"
                className="py-1.5"
              />
              <Select
                value={addType}
                onChange={(e) => setAddType(e.target.value)}
                className="py-1.5"
              >
                {Object.keys(entityTypeColors).map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
              <Input
                type="text"
                value={addDesc}
                onChange={(e) => setAddDesc(e.target.value)}
                placeholder="Description (optional)"
                className="py-1.5"
              />
              <Button
                type="submit"
                size="sm"
                loading={addLoading}
                className="w-full"
              >
                <Plus className="w-3.5 h-3.5" />
                Add
              </Button>
            </form>
          </Card>
        </div>

        {/* Right panel: graph */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Graph controls */}
          <div className="flex items-center gap-2 mb-3">
            <Select
              value={startNodeId}
              onChange={(e) => setStartNodeId(e.target.value)}
              className="flex-1"
            >
              <option value="">Select start node...</option>
              {entities.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name} ({e.entity_type})
                </option>
              ))}
            </Select>
            <Button
              size="sm"
              onClick={handleTraverse}
              loading={graphLoading}
              disabled={!startNodeId}
            >
              <Network className="w-3.5 h-3.5" />
              Traverse
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={handleShowAll}
              loading={graphLoading}
            >
              <Network className="w-3.5 h-3.5" />
              Show All
            </Button>

            {/* View mode toggle */}
            <div className="flex items-center gap-0 ml-3">
              <button
                onClick={() => setViewMode("graph")}
                className={`px-3 py-1 text-xs font-medium rounded-l-md border ${viewMode === "graph" ? "bg-teal/10 text-teal border-teal" : "text-gray-400 border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800"}`}
              >
                Graph
              </button>
              <button
                onClick={() => setViewMode("mermaid")}
                className={`px-3 py-1 text-xs font-medium rounded-r-md border-t border-r border-b ${viewMode === "mermaid" ? "bg-teal/10 text-teal border-teal" : "text-gray-400 border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800"}`}
              >
                Mermaid
              </button>
            </div>
          </div>

          {/* Graph visualization */}
          {viewMode === "mermaid" ? (
            <MermaidDiagram
              definition={generateMermaid(graphData.nodes, graphData.edges)}
            />
          ) : (
            <div
              ref={graphContainerRef}
              className="flex-1 min-h-[400px] border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
            >
              <ForceGraph
                nodes={graphData.nodes}
                edges={graphData.edges}
                width={graphSize.width}
                height={graphSize.height}
              />
            </div>
          )}

          {/* Legend — shows types present in current graph */}
          {graphEntityTypes.length > 0 && (
            <div className="flex items-center gap-4 mt-2 flex-wrap">
              {graphEntityTypes.map((t) => (
                <div
                  key={t}
                  className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400"
                >
                  <span
                    className="w-3 h-3 rounded-full"
                    style={{
                      backgroundColor: entityTypeColors[t] || "#6b7280",
                    }}
                  />
                  {t}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Add Relation Modal */}
      <Modal
        open={relationModalOpen}
        onClose={() => {
          setRelationModalOpen(false);
          setRelSourceId("");
          setRelTargetId("");
        }}
        title="Add Relation"
      >
        <form onSubmit={handleAddRelation} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Source Entity <span className="text-red-500">*</span>
            </label>
            <Select
              value={relSourceId}
              onChange={(e) => setRelSourceId(e.target.value)}
            >
              <option value="">Select source...</option>
              {entities.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name} ({e.entity_type})
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Relation Type <span className="text-red-500">*</span>
            </label>
            <Select
              value={relType}
              onChange={(e) => setRelType(e.target.value)}
            >
              {RELATION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t.replace(/_/g, " ")}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Target Entity <span className="text-red-500">*</span>
            </label>
            <Select
              value={relTargetId}
              onChange={(e) => setRelTargetId(e.target.value)}
            >
              <option value="">Select target...</option>
              {entities.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name} ({e.entity_type})
                </option>
              ))}
            </Select>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setRelationModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              loading={relLoading}
              disabled={!relSourceId || !relTargetId}
            >
              <GitBranch className="w-4 h-4" />
              Create Relation
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
