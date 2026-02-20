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
  const lines = ["graph LR"];
  const nodeIdMap = new Map<string, string>();
  const styleLines: string[] = [];

  nodes.forEach((n, i) => {
    const sid = `N${i}`;
    nodeIdMap.set(n.id, sid);
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
    // Color code by entity type
    const color = entityTypeColors[n.entity_type] || "#6b7280";
    styleLines.push(
      `  style ${sid} fill:${color},stroke:${color},color:#fff,stroke-width:2px`,
    );
  });

  edges.forEach((e) => {
    const src = nodeIdMap.get(e.source);
    const tgt = nodeIdMap.get(e.target);
    if (src && tgt) {
      lines.push(`  ${src} -->|${e.relation_type}| ${tgt}`);
    }
  });

  // Append style directives
  lines.push(...styleLines);

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
  const pinnedRef = useRef<Set<string>>(new Set());
  const [renderTick, setRenderTick] = useState(0);
  const frameRef = useRef<number>(0);
  const [dragNode, setDragNode] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Pan / zoom
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const panDrag = useRef({
    active: false,
    startX: 0,
    startY: 0,
    panX: 0,
    panY: 0,
  });

  // Compute degree (connection count) per node
  const degreeMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of edges) {
      m.set(e.source, (m.get(e.source) || 0) + 1);
      m.set(e.target, (m.get(e.target) || 0) + 1);
    }
    return m;
  }, [edges]);

  const maxDegree = useMemo(
    () => Math.max(1, ...Array.from(degreeMap.values())),
    [degreeMap],
  );

  function nodeRadius(id: string) {
    const deg = degreeMap.get(id) || 0;
    return 12 + (deg / maxDegree) * 20; // 12px min, 32px max
  }

  // Initialize nodes — tight cluster around center
  useEffect(() => {
    const existing = new Map(nodesRef.current.map((n) => [n.id, n]));
    const cx = width / 2;
    const cy = height / 2;
    const spread = Math.min(width, height) * 0.15;
    nodesRef.current = rawNodes.map((n) => {
      const prev = existing.get(n.id);
      if (prev) return { ...prev, name: n.name, entity_type: n.entity_type };
      return {
        id: n.id,
        name: n.name,
        entity_type: n.entity_type,
        x: cx + (Math.random() - 0.5) * spread * 2,
        y: cy + (Math.random() - 0.5) * spread * 2,
        vx: 0,
        vy: 0,
      };
    });
    pinnedRef.current.clear();
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setRenderTick((t) => t + 1);
  }, [rawNodes, width, height]);

  // Force simulation
  useEffect(() => {
    let running = true;
    let alpha = 1;

    // Pre-compute connected set for orphan detection
    const connected = new Set<string>();
    for (const e of edges) {
      connected.add(e.source);
      connected.add(e.target);
    }

    function tick() {
      if (!running) return;

      const nodes = nodesRef.current;
      const pinned = pinnedRef.current;
      const damping = 0.85;
      alpha *= 0.994;

      if (alpha < 0.001) {
        frameRef.current = requestAnimationFrame(tick);
        return;
      }

      // Moderate repulsion — enough to separate, not enough to scatter
      const repulsionStrength = 400;
      const edgeTargetLen = 120;

      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];
          let dx = b.x - a.x;
          let dy = b.y - a.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          // Cap repulsion at close range to prevent explosions
          const effectiveDist = Math.max(dist, 30);
          const force =
            (repulsionStrength * alpha) / (effectiveDist * effectiveDist);
          dx *= force;
          dy *= force;

          const aFixed = a.id === dragNode || pinned.has(a.id);
          const bFixed = b.id === dragNode || pinned.has(b.id);
          if (!aFixed) {
            a.vx -= dx;
            a.vy -= dy;
          }
          if (!bFixed) {
            b.vx += dx;
            b.vy += dy;
          }
        }
      }

      // Edge attraction
      const nodeMap = new Map(nodes.map((n) => [n.id, n]));
      for (const edge of edges) {
        const a = nodeMap.get(edge.source);
        const b = nodeMap.get(edge.target);
        if (!a || !b) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = (dist - edgeTargetLen) * 0.03 * alpha;

        const aFixed = a.id === dragNode || pinned.has(a.id);
        const bFixed = b.id === dragNode || pinned.has(b.id);
        if (!aFixed) {
          a.vx += (dx / dist) * force;
          a.vy += (dy / dist) * force;
        }
        if (!bFixed) {
          b.vx -= (dx / dist) * force;
          b.vy -= (dy / dist) * force;
        }
      }

      // Center gravity — strong for orphans, moderate for connected
      const cx = width / 2;
      const cy = height / 2;
      for (const n of nodes) {
        if (n.id === dragNode || pinned.has(n.id)) continue;
        const isOrphan = !connected.has(n.id);
        const gravity = isOrphan ? 0.04 : 0.008;
        n.vx += (cx - n.x) * gravity * alpha;
        n.vy += (cy - n.y) * gravity * alpha;
        n.vx *= damping;
        n.vy *= damping;
        n.x += n.vx;
        n.y += n.vy;
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

  // --- Node drag (pins on release) ---
  const handleNodeMouseDown = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragNode(id);
  };

  const handleNodeDblClick = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    pinnedRef.current.delete(id);
  };

  useEffect(() => {
    if (!dragNode) return;

    const handleMove = (e: MouseEvent) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const node = nodesRef.current.find((n) => n.id === dragNode);
      if (node) {
        node.x = (e.clientX - rect.left - pan.x) / zoom;
        node.y = (e.clientY - rect.top - pan.y) / zoom;
        node.vx = 0;
        node.vy = 0;
        setRenderTick((t) => t + 1);
      }
    };

    const handleUp = () => {
      pinnedRef.current.add(dragNode);
      setDragNode(null);
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [dragNode, zoom, pan]);

  // --- Pan ---
  const handleSvgMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      panDrag.current = {
        active: true,
        startX: e.clientX,
        startY: e.clientY,
        panX: pan.x,
        panY: pan.y,
      };
    },
    [pan],
  );

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const pd = panDrag.current;
      if (!pd.active) return;
      setPan({
        x: pd.panX + (e.clientX - pd.startX),
        y: pd.panY + (e.clientY - pd.startY),
      });
    };
    const onUp = () => {
      panDrag.current.active = false;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  // --- Zoom (native listener with passive:false so preventDefault works) ---
  const zoomRef = useRef({ zoom, pan });
  zoomRef.current = { zoom, pan };
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const rect = el.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const { zoom: z, pan: p } = zoomRef.current;
      const delta = -e.deltaY * 0.008;
      const factor = Math.max(0.8, Math.min(1.2, 1 + delta));
      const newZoom = Math.min(4, Math.max(0.3, z * factor));
      setPan({
        x: mouseX - ((mouseX - p.x) / z) * newZoom,
        y: mouseY - ((mouseY - p.y) / z) * newZoom,
      });
      setZoom(newZoom);
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const isEmpty = nodesRef.current.length === 0;

  return (
    <div ref={wrapperRef} className="absolute inset-0">
      {isEmpty && (
        <div className="absolute inset-0 flex items-center justify-center text-gray-400 dark:text-gray-500 text-sm z-10">
          <div className="text-center">
            <Network className="w-10 h-10 mx-auto mb-2 opacity-50" />
            <p>Select a start node and traverse to see the graph</p>
          </div>
        </div>
      )}
      {/* Zoom toolbar */}
      <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm rounded-md px-2 py-1 border border-gray-200 dark:border-gray-700 shadow-sm">
        <button
          onClick={() => setZoom((z) => Math.min(4, z * 1.25))}
          className="px-1.5 py-0.5 text-xs font-bold rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300"
        >
          +
        </button>
        <button
          onClick={() => setZoom((z) => Math.max(0.3, z * 0.8))}
          className="px-1.5 py-0.5 text-xs font-bold rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300"
        >
          -
        </button>
        <button
          onClick={() => {
            setZoom(1);
            setPan({ x: 0, y: 0 });
          }}
          className="px-1.5 py-0.5 text-xs rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300"
        >
          Reset
        </button>
        <span className="text-[10px] text-gray-400 ml-0.5">
          {Math.round(zoom * 100)}%
        </span>
      </div>
      <div className="absolute bottom-2 right-2 z-10 text-[10px] text-gray-400 dark:text-gray-500">
        Scroll to zoom · Drag to pan · Drag nodes to place · Dbl-click to unpin
      </div>
      <svg
        ref={svgRef}
        className="absolute inset-0 w-full h-full bg-gray-50 dark:bg-gray-800/30 rounded-lg cursor-grab active:cursor-grabbing"
        onMouseDown={handleSvgMouseDown}
      >
        <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
          {/* Edges */}
          {edges.map((e, i) => {
            const a = nodeMap.get(e.source);
            const b = nodeMap.get(e.target);
            if (!a || !b) return null;
            const mx = (a.x + b.x) / 2;
            const my = (a.y + b.y) / 2;
            return (
              <g key={`edge-${i}`}>
                <line
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke="#64748b"
                  strokeWidth={1.5}
                  strokeOpacity={0.4}
                />
                <rect
                  x={mx - 36}
                  y={my - 16}
                  width={72}
                  height={16}
                  rx={3}
                  fill="#1e1b2e"
                  fillOpacity={0.75}
                />
                <text
                  x={mx}
                  y={my - 4}
                  textAnchor="middle"
                  fontSize={11}
                  fill="#94a3b8"
                >
                  {e.relation_type}
                </text>
              </g>
            );
          })}
          {/* Nodes */}
          {nodesRef.current.map((n) => {
            const isPinned = pinnedRef.current.has(n.id);
            const r = nodeRadius(n.id);
            const labelLen = n.name.length * 5.5 + 10;
            return (
              <g
                key={n.id}
                onMouseDown={handleNodeMouseDown(n.id)}
                onDoubleClick={handleNodeDblClick(n.id)}
                style={{ cursor: dragNode === n.id ? "grabbing" : "grab" }}
              >
                <circle
                  cx={n.x}
                  cy={n.y}
                  r={r}
                  fill={entityTypeColors[n.entity_type] || "#6b7280"}
                  fillOpacity={0.85}
                  stroke={isPinned ? "#ffffff" : "rgba(255,255,255,0.3)"}
                  strokeWidth={isPinned ? 3 : 1.5}
                />
                {/* Label background */}
                <rect
                  x={n.x - labelLen / 2}
                  y={n.y + r + 4}
                  width={labelLen}
                  height={18}
                  rx={4}
                  fill="#0f0d1a"
                  fillOpacity={0.75}
                />
                <text
                  x={n.x}
                  y={n.y + r + 17}
                  textAnchor="middle"
                  fontSize={14}
                  fontWeight={500}
                  fill="#e5e7eb"
                >
                  {n.name}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
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
  const viewportRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<HTMLDivElement>(null);
  const renderCount = useRef(0);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragState = useRef<{
    dragging: boolean;
    startX: number;
    startY: number;
    panX: number;
    panY: number;
  }>({
    dragging: false,
    startX: 0,
    startY: 0,
    panX: 0,
    panY: 0,
  });

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;

    renderCount.current += 1;
    const id = `mermaid-diagram-${renderCount.current}`;
    el.innerHTML = "";

    mermaid
      .render(id, definition)
      .then(({ svg }) => {
        if (svgRef.current) {
          svgRef.current.innerHTML = svg;
          const svgEl = svgRef.current.querySelector("svg");
          if (svgEl) {
            svgEl.style.maxWidth = "none";
            svgEl.removeAttribute("height");

            // Auto-fit: measure SVG and viewport, scale to fit
            requestAnimationFrame(() => {
              const viewport = viewportRef.current;
              if (!viewport || !svgEl) return;
              const vw = viewport.clientWidth;
              const vh = viewport.clientHeight;
              const svgRect = svgEl.getBoundingClientRect();
              const sw = svgRect.width;
              const sh = svgRect.height;
              if (sw > 0 && sh > 0 && vw > 0 && vh > 0) {
                const fitZoom = Math.min(vw / sw, vh / sh) * 0.9; // 90% to add padding
                const clampedZoom = Math.min(4, Math.max(0.3, fitZoom));
                // Center the diagram in the viewport
                const cx = (vw - sw * clampedZoom) / 2;
                const cy = (vh - sh * clampedZoom) / 2;
                setZoom(clampedZoom);
                setPan({ x: Math.max(0, cx), y: Math.max(0, cy) });
              }
            });
          }
        }
      })
      .catch(() => {
        if (svgRef.current) {
          const pre = document.createElement("pre");
          pre.className =
            "text-xs font-mono text-gray-400 whitespace-pre-wrap p-2";
          pre.textContent = definition;
          svgRef.current.innerHTML = "";
          svgRef.current.appendChild(pre);
        }
      });

    // Reset pan/zoom when definition changes (auto-fit will override)
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [definition]);

  // Native wheel listener with passive:false so preventDefault stops page zoom
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const delta = -e.deltaY * 0.008;
      const factor = Math.max(0.8, Math.min(1.2, 1 + delta));
      setZoom((z) => Math.min(4, Math.max(0.3, z * factor)));
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      dragState.current = {
        dragging: true,
        startX: e.clientX,
        startY: e.clientY,
        panX: pan.x,
        panY: pan.y,
      };
    },
    [pan],
  );

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const ds = dragState.current;
      if (!ds.dragging) return;
      setPan({
        x: ds.panX + (e.clientX - ds.startX),
        y: ds.panY + (e.clientY - ds.startY),
      });
    };
    const handleMouseUp = () => {
      dragState.current.dragging = false;
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  return (
    <div className="flex-1 flex flex-col min-h-[400px] border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-gray-50 dark:bg-gray-800/30">
      {/* Zoom controls */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-gray-200 dark:border-gray-700 shrink-0">
        <button
          onClick={() => setZoom((z) => Math.min(5, z + 0.25))}
          className="px-2 py-0.5 text-xs font-medium rounded bg-white/10 hover:bg-white/20 text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600"
        >
          +
        </button>
        <button
          onClick={() => setZoom((z) => Math.max(0.2, z - 0.25))}
          className="px-2 py-0.5 text-xs font-medium rounded bg-white/10 hover:bg-white/20 text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600"
        >
          -
        </button>
        <button
          onClick={() => {
            setZoom(1);
            setPan({ x: 0, y: 0 });
          }}
          className="px-2 py-0.5 text-xs font-medium rounded bg-white/10 hover:bg-white/20 text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600"
        >
          Reset
        </button>
        <span className="text-[10px] text-gray-400 ml-1">
          {Math.round(zoom * 100)}%
        </span>
        <span className="text-[10px] text-gray-500 ml-auto">
          Scroll to zoom · Drag to pan
        </span>
      </div>
      {/* Pannable/zoomable viewport */}
      <div
        ref={viewportRef}
        className="flex-1 overflow-hidden cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown}
      >
        <div
          ref={svgRef}
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "top left",
            transition: dragState.current.dragging
              ? "none"
              : "transform 0.1s ease-out",
          }}
          className="p-4 inline-block"
        />
      </div>
    </div>
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
            <div className="flex items-center ml-3">
              <button
                onClick={() => setViewMode("graph")}
                className={`px-3 py-1 text-xs font-medium rounded-l-md border ${viewMode === "graph" ? "bg-teal/10 text-teal border-teal relative z-10" : "text-gray-400 border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800"}`}
              >
                Graph
              </button>
              <button
                onClick={() => setViewMode("mermaid")}
                className={`px-3 py-1 text-xs font-medium rounded-r-md border -ml-px ${viewMode === "mermaid" ? "bg-teal/10 text-teal border-teal relative z-10" : "text-gray-400 border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800"}`}
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
              className="flex-1 h-0 relative border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
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
