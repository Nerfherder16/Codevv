import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from "react";
import { useParams, useNavigate } from "react-router-dom";
import { GitBranch, AlertTriangle, Network, X, ArrowLeft } from "lucide-react";
import { api } from "../lib/api";
import { useToast } from "../contexts/ToastContext";
import { Button } from "../components/common/Button";
import { Card } from "../components/common/Card";
import { PageHeader } from "../components/common/PageHeader";
import { PageLoading } from "../components/common/LoadingSpinner";
import { EmptyState, GraphIllustration } from "../components/common/EmptyState";

interface DepNode {
  id: string;
  name: string;
  component_type: string;
  tech_stack: string | null;
  canvas_id: string | null;
}

interface DepEdge {
  source_id: string;
  target_id: string;
  relation_type: string;
  weight: number | null;
}

interface DepGraph {
  nodes: DepNode[];
  edges: DepEdge[];
  stats: { node_count: number; edge_count: number; max_depth: number };
}

interface CycleData {
  cycles: string[][];
  has_cycles: boolean;
}

interface ForceNode {
  id: string;
  name: string;
  component_type: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

const TYPE_COLORS: Record<string, string> = {
  service: "#3b82f6",
  database: "#10b981",
  queue: "#f59e0b",
  api: "#8b5cf6",
  cache: "#a855f7",
  frontend: "#f472b6",
  gateway: "#fb923c",
  smart_contract: "#8b5cf6",
  infrastructure: "#6b7280",
  integration: "#f97316",
  agent: "#ef4444",
  worker: "#eab308",
  middleware: "#38bdf8",
  mobile_app: "#ec4899",
  web_app: "#f472b6",
  actor: "#3b82f6",
  constraint: "#ef4444",
  compute: "#0ea5e9",
  security: "#dc2626",
  monitoring: "#eab308",
  pipeline: "#f97316",
};

const TYPE_BADGE: Record<string, string> = {
  service: "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300",
  database:
    "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300",
  queue: "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300",
  api: "bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300",
  cache:
    "bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300",
  frontend: "bg-pink-100 dark:bg-pink-900/40 text-pink-700 dark:text-pink-300",
  gateway:
    "bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300",
  smart_contract:
    "bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300",
  infrastructure:
    "bg-gray-100 dark:bg-gray-900/40 text-gray-700 dark:text-gray-300",
  integration:
    "bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300",
  agent: "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300",
  worker:
    "bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300",
  middleware: "bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300",
  mobile_app:
    "bg-pink-100 dark:bg-pink-900/40 text-pink-700 dark:text-pink-300",
  web_app: "bg-pink-100 dark:bg-pink-900/40 text-pink-700 dark:text-pink-300",
  actor: "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300",
  constraint: "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300",
  compute: "bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300",
  security: "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300",
  monitoring:
    "bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300",
  pipeline:
    "bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300",
};

const DEFAULT_COLOR = "#6b7280";

function nodeColor(type: string): string {
  return TYPE_COLORS[type] || DEFAULT_COLOR;
}

/* ---------- Force Graph ---------- */

function DepForceGraph({
  nodes: rawNodes,
  edges,
  width,
  height,
  onNodeClick,
}: {
  nodes: DepNode[];
  edges: DepEdge[];
  width: number;
  height: number;
  onNodeClick: (node: DepNode) => void;
}) {
  const nodesRef = useRef<ForceNode[]>([]);
  const [renderTick, setRenderTick] = useState(0);
  const frameRef = useRef<number>(0);
  const [dragNode, setDragNode] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const existing = new Map(nodesRef.current.map((n) => [n.id, n]));
    const spread = Math.min(width, height) * 0.35;
    nodesRef.current = rawNodes.map((n) => {
      const prev = existing.get(n.id);
      if (prev)
        return { ...prev, name: n.name, component_type: n.component_type };
      return {
        id: n.id,
        name: n.name,
        component_type: n.component_type,
        x: width / 2 + (Math.random() - 0.5) * spread * 2,
        y: height / 2 + (Math.random() - 0.5) * spread * 2,
        vx: 0,
        vy: 0,
      };
    });
    setRenderTick((t) => t + 1);
  }, [rawNodes, width, height]);

  useEffect(() => {
    let running = true;
    let alpha = 1;

    const canvasScale = Math.min(width, height);
    const repulsionStrength = canvasScale * 0.8;
    const edgeTargetLen = canvasScale * 0.15;

    function tick() {
      if (!running) return;
      const nodes = nodesRef.current;
      const damping = 0.9;
      alpha *= 0.995;

      if (alpha < 0.001) {
        frameRef.current = requestAnimationFrame(tick);
        return;
      }

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

      const nodeMap = new Map(nodes.map((n) => [n.id, n]));
      for (const edge of edges) {
        const a = nodeMap.get(edge.source_id);
        const b = nodeMap.get(edge.target_id);
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

      const cx = width / 2;
      const cy = height / 2;
      for (const n of nodes) {
        if (n.id === dragNode) continue;
        n.vx += (cx - n.x) * 0.002 * alpha;
        n.vy += (cy - n.y) * 0.002 * alpha;
        n.vx *= damping;
        n.vy *= damping;
        n.x += n.vx;
        n.y += n.vy;
        n.x = Math.max(30, Math.min(width - 30, n.x));
        n.y = Math.max(30, Math.min(height - 30, n.y));
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
    void renderTick;
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
      <EmptyState
        icon={<GraphIllustration />}
        title="No dependencies"
        description="This project has no component dependencies mapped yet."
      />
    );
  }

  return (
    <svg
      ref={svgRef}
      width={width}
      height={height}
      className="bg-gray-50 dark:bg-gray-800/30 rounded-lg"
    >
      {/* Arrow marker */}
      <defs>
        <marker
          id="dep-arrow"
          viewBox="0 0 10 10"
          refX={28}
          refY={5}
          markerWidth={6}
          markerHeight={6}
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" fillOpacity={0.6} />
        </marker>
      </defs>
      {edges.map((e, i) => {
        const a = nodeMap.get(e.source_id);
        const b = nodeMap.get(e.target_id);
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
              markerEnd="url(#dep-arrow)"
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
      {nodesRef.current.map((n) => {
        const raw = rawNodes.find((r) => r.id === n.id);
        return (
          <g
            key={n.id}
            onMouseDown={handleMouseDown(n.id)}
            onClick={() => raw && onNodeClick(raw)}
            style={{ cursor: dragNode === n.id ? "grabbing" : "grab" }}
          >
            <circle
              cx={n.x}
              cy={n.y}
              r={18}
              fill={nodeColor(n.component_type)}
              fillOpacity={0.8}
              stroke={nodeColor(n.component_type)}
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
        );
      })}
    </svg>
  );
}

/* ---------- Main Page ---------- */

export function DependencyMapPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [graph, setGraph] = useState<DepGraph | null>(null);
  const [cycles, setCycles] = useState<CycleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedNode, setSelectedNode] = useState<DepNode | null>(null);

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

  const fetchData = useCallback(async () => {
    if (!projectId) return;
    try {
      const [graphRes, cycleRes] = await Promise.all([
        api.get<DepGraph>(`/projects/${projectId}/dependencies`),
        api.get<CycleData>(`/projects/${projectId}/dependencies/cycles`),
      ]);
      setGraph(graphRes);
      setCycles(cycleRes);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to load dependencies";
      toast(msg, "error");
    } finally {
      setLoading(false);
    }
  }, [projectId, toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const nodeNameMap = useMemo(() => {
    if (!graph) return new Map<string, string>();
    return new Map(graph.nodes.map((n) => [n.id, n.name]));
  }, [graph]);

  if (loading) return <PageLoading />;

  const stats = graph?.stats ?? { node_count: 0, edge_count: 0, max_depth: 0 };
  const statItems = [
    { label: "Components", value: stats.node_count, color: "text-blue-400" },
    {
      label: "Dependencies",
      value: stats.edge_count,
      color: "text-violet-400",
    },
    { label: "Max Depth", value: stats.max_depth, color: "text-amber-400" },
  ];

  return (
    <div className="h-full flex flex-col">
      <PageHeader
        title="Dependency Map"
        description="Visualize component dependencies and detect cycles."
        action={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(`/projects/${projectId}`)}
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>
        }
      />

      {/* Stats bar */}
      <div className="flex gap-3 mb-4">
        {statItems.map((s) => (
          <Card key={s.label} className="flex-1 p-3">
            <p className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
              {s.label}
            </p>
            <p className={`text-2xl font-light mt-1 ${s.color}`}>{s.value}</p>
          </Card>
        ))}
      </div>

      {/* Graph + sidebar */}
      <div className="flex-1 flex gap-4 min-h-0">
        <div
          ref={graphContainerRef}
          className="flex-1 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
        >
          <DepForceGraph
            nodes={graph?.nodes ?? []}
            edges={graph?.edges ?? []}
            width={graphSize.width}
            height={graphSize.height}
            onNodeClick={setSelectedNode}
          />
        </div>

        {selectedNode && (
          <div className="w-72 shrink-0 flex flex-col gap-3">
            <Card className="p-4">
              <div className="flex items-start justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                  {selectedNode.name}
                </h3>
                <button
                  onClick={() => setSelectedNode(null)}
                  className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="space-y-2">
                <div>
                  <p className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Type
                  </p>
                  <span
                    className={`inline-block mt-1 text-xs font-medium px-2 py-0.5 rounded-full ${TYPE_BADGE[selectedNode.component_type] || "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"}`}
                  >
                    {selectedNode.component_type}
                  </span>
                </div>
                {selectedNode.tech_stack && (
                  <div>
                    <p className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      Tech Stack
                    </p>
                    <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">
                      {selectedNode.tech_stack}
                    </p>
                  </div>
                )}
                {selectedNode.canvas_id && (
                  <div>
                    <p className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      Canvas
                    </p>
                    <p className="text-sm text-gray-700 dark:text-gray-300 mt-1 font-mono text-xs">
                      {selectedNode.canvas_id}
                    </p>
                  </div>
                )}
              </div>
            </Card>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-2">
        {Object.keys(TYPE_COLORS).map((t) => (
          <div
            key={t}
            className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400"
          >
            <span
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: TYPE_COLORS[t] }}
            />
            {t}
          </div>
        ))}
        <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
          <span
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: DEFAULT_COLOR }}
          />
          other
        </div>
      </div>

      {/* Cycle warnings */}
      {cycles?.has_cycles && (
        <div className="mt-4 rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-5 h-5 text-red-500" />
            <h3 className="text-sm font-semibold text-red-700 dark:text-red-300">
              Circular Dependencies Detected
            </h3>
          </div>
          <ul className="space-y-1">
            {cycles.cycles.map((cycle, i) => (
              <li
                key={i}
                className="text-sm text-red-600 dark:text-red-400 font-mono"
              >
                {cycle.map((id) => nodeNameMap.get(id) || id).join(" → ")} {"→"}{" "}
                {nodeNameMap.get(cycle[0]) || cycle[0]}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
