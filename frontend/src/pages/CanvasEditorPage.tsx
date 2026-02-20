import React, { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Tldraw, createShapeId, toRichText, Editor } from "@tldraw/tldraw";
import "@tldraw/tldraw/tldraw.css";
import {
  ArrowLeft,
  Plus,
  Layers,
  Server,
  Database,
  HardDrive,
  Globe,
  Monitor,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  Trash2,
} from "lucide-react";
import { api } from "../lib/api";
import type { CanvasDetail, CanvasComponent } from "../types";
import { useToast } from "../contexts/ToastContext";
import { Button } from "../components/common/Button";
import { PageLoading } from "../components/common/LoadingSpinner";
import { Input, Select, TextArea } from "../components/common/Input";

const COMPONENT_TYPES = [
  "service",
  "database",
  "queue",
  "cache",
  "frontend",
  "gateway",
] as const;

type ComponentType = (typeof COMPONENT_TYPES)[number];

const typeIcons: Record<ComponentType, React.ReactNode> = {
  service: <Server className="w-4 h-4" />,
  database: <Database className="w-4 h-4" />,
  queue: <HardDrive className="w-4 h-4" />,
  cache: <HardDrive className="w-4 h-4" />,
  frontend: <Monitor className="w-4 h-4" />,
  gateway: <ShieldCheck className="w-4 h-4" />,
};

const typeColors: Record<ComponentType, string> = {
  service: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300",
  database:
    "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300",
  queue:
    "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300",
  cache:
    "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300",
  frontend: "bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300",
  gateway:
    "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300",
};

type TldrawColor =
  | "blue"
  | "green"
  | "yellow"
  | "violet"
  | "light-red"
  | "orange"
  | "red"
  | "light-blue"
  | "light-green"
  | "grey";

const tldrawColors: Record<string, TldrawColor> = {
  service: "blue",
  api: "blue",
  middleware: "light-blue",
  route: "light-blue",
  database: "green",
  cache: "violet",
  queue: "yellow",
  frontend: "light-red",
  gateway: "orange",
  smart_contract: "violet",
  worker: "yellow",
  account: "light-green",
  infrastructure: "grey",
  integration: "orange",
  agent: "red",
  mobile_app: "light-red",
  web_app: "light-red",
  library: "light-blue",
  flow: "yellow",
  transaction: "green",
  actor: "blue",
  constraint: "red",
  compute: "blue",
  security: "red",
  tool: "grey",
  pipeline: "orange",
  monitoring: "yellow",
  blockchain_infra: "violet",
};

interface DependencyEdge {
  source_id: string;
  target_id: string;
  relation_type: string;
}

function populateTldrawShapes(
  editor: Editor,
  components: CanvasComponent[],
  edges?: DependencyEdge[],
) {
  if (components.length === 0) return;

  // Check if shapes already exist (avoid duplicating on re-render)
  const existing = editor.getCurrentPageShapes();
  if (existing.length > 0) return;

  const COL_WIDTH = 320;
  const ROW_HEIGHT = 110;
  const SHAPE_W = 280;
  const SHAPE_H = 90;
  const COLS = Math.min(4, Math.ceil(Math.sqrt(components.length)));
  const GAP_X = 40;
  const GAP_Y = 20;

  // Create shapes and store id mapping for arrows
  const compIdToShapeId = new Map<string, string>();

  const shapes = components.map((comp, i) => {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const color = tldrawColors[comp.component_type] || ("grey" as TldrawColor);

    const label = comp.tech_stack
      ? `${comp.name}\n${comp.tech_stack}`
      : comp.name;

    const shapeId = createShapeId();
    compIdToShapeId.set(comp.id, shapeId as string);

    return {
      id: shapeId,
      type: "geo" as const,
      x: col * (COL_WIDTH + GAP_X),
      y: row * (ROW_HEIGHT + GAP_Y),
      props: {
        geo: "rectangle" as const,
        w: SHAPE_W,
        h: SHAPE_H,
        fill: "solid" as const,
        color,
        font: "sans" as const,
        size: "m" as const,
        align: "middle" as const,
        verticalAlign: "middle" as const,
        richText: toRichText(label),
      },
    };
  });

  editor.createShapes(shapes);

  // Create arrows for dependency edges
  if (edges && edges.length > 0) {
    const arrowShapes = edges
      .map((e) => {
        const sourceShapeId = compIdToShapeId.get(e.source_id);
        const targetShapeId = compIdToShapeId.get(e.target_id);
        if (!sourceShapeId || !targetShapeId) return null;

        const sourceIdx = components.findIndex((c) => c.id === e.source_id);
        const targetIdx = components.findIndex((c) => c.id === e.target_id);
        if (sourceIdx === -1 || targetIdx === -1) return null;

        const srcCol = sourceIdx % COLS;
        const srcRow = Math.floor(sourceIdx / COLS);
        const tgtCol = targetIdx % COLS;
        const tgtRow = Math.floor(targetIdx / COLS);

        return {
          id: createShapeId(),
          type: "arrow" as const,
          x: 0,
          y: 0,
          props: {
            start: {
              x: srcCol * (COL_WIDTH + GAP_X) + SHAPE_W / 2,
              y: srcRow * (ROW_HEIGHT + GAP_Y) + SHAPE_H,
            },
            end: {
              x: tgtCol * (COL_WIDTH + GAP_X) + SHAPE_W / 2,
              y: tgtRow * (ROW_HEIGHT + GAP_Y),
            },
            color: "grey" as const,
            size: "s" as const,
            arrowheadEnd: "arrow" as const,
          },
        };
      })
      .filter(Boolean);

    if (arrowShapes.length > 0) {
      editor.createShapes(arrowShapes as any);
    }
  }

  // Small delay to let shapes render, then zoom to fit
  requestAnimationFrame(() => {
    editor.zoomToFit();
  });
}

export function CanvasEditorPage() {
  const { projectId, canvasId } = useParams<{
    projectId: string;
    canvasId: string;
  }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [canvas, setCanvas] = useState<CanvasDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [panelOpen, setPanelOpen] = useState(true);
  const [hideTools, setHideTools] = useState(false);
  const editorRef = useRef<Editor | null>(null);

  // Add-component form state
  const [compName, setCompName] = useState("");
  const [compType, setCompType] = useState<ComponentType>("service");
  const [compTechStack, setCompTechStack] = useState("");
  const [compDescription, setCompDescription] = useState("");
  const [adding, setAdding] = useState(false);

  const fetchCanvas = useCallback(async () => {
    if (!projectId || !canvasId) return;

    try {
      const data = await api.get<CanvasDetail>(
        `/projects/${projectId}/canvases/${canvasId}`,
      );
      setCanvas(data);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load canvas";
      toast(message, "error");
    } finally {
      setLoading(false);
    }
  }, [projectId, canvasId, toast]);

  useEffect(() => {
    fetchCanvas();
  }, [fetchCanvas]);

  const handleAddComponent = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!compName.trim()) {
      toast("Component name is required.", "error");
      return;
    }

    setAdding(true);
    try {
      const component = await api.post<CanvasComponent>(
        `/projects/${projectId}/canvases/${canvasId}/components`,
        {
          name: compName.trim(),
          component_type: compType,
          tech_stack: compTechStack.trim() || null,
          description: compDescription.trim() || null,
        },
      );

      setCanvas((prev) =>
        prev
          ? {
              ...prev,
              components: [...prev.components, component],
              component_count: prev.component_count + 1,
            }
          : prev,
      );

      // Add shape to live tldraw canvas
      if (editorRef.current) {
        const ed = editorRef.current;
        const count = ed.getCurrentPageShapes().length;
        const col = count % 4;
        const row = Math.floor(count / 4);
        const color = tldrawColors[component.component_type] || "grey";
        const label = component.tech_stack
          ? `${component.name}\n${component.tech_stack}`
          : component.name;

        ed.createShape({
          id: createShapeId(),
          type: "geo",
          x: col * 360,
          y: row * 130,
          props: {
            geo: "rectangle",
            w: 280,
            h: 90,
            fill: "solid",
            color,
            font: "sans",
            size: "m",
            align: "middle",
            verticalAlign: "middle",
            richText: toRichText(label),
          },
        });
      }

      toast("Component added!", "success");
      setCompName("");
      setCompTechStack("");
      setCompDescription("");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to add component";
      toast(message, "error");
    } finally {
      setAdding(false);
    }
  };

  const handleDeleteComponent = async (componentId: string) => {
    try {
      await api.delete(
        `/projects/${projectId}/canvases/${canvasId}/components/${componentId}`,
      );
      setCanvas((prev) =>
        prev
          ? {
              ...prev,
              components: prev.components.filter((c) => c.id !== componentId),
              component_count: Math.max(0, prev.component_count - 1),
            }
          : prev,
      );
      toast("Component removed.", "success");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to delete component";
      toast(message, "error");
    }
  };

  if (loading) {
    return <PageLoading />;
  }

  if (!canvas) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <Layers className="w-12 h-12 text-gray-400 dark:text-gray-600 mb-3" />
        <p className="text-gray-500 dark:text-gray-400 text-lg font-medium">
          Canvas not found
        </p>
        <Button
          variant="ghost"
          className="mt-4"
          onClick={() => navigate(`/projects/${projectId}/canvas`)}
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Canvases
        </Button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex flex-col bg-white dark:bg-gray-950">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 z-10 shrink-0">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(`/projects/${projectId}/canvas`)}
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <h1 className="text-sm font-semibold text-gray-900 dark:text-white truncate">
            {canvas.name}
          </h1>
          <span className="text-xs text-gray-400 dark:text-gray-500">
            {canvas.component_count}{" "}
            {canvas.component_count === 1 ? "component" : "components"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setHideTools(!hideTools)}
          >
            <Layers className="w-4 h-4" />
            {hideTools ? "Show Tools" : "Hide Tools"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setPanelOpen(!panelOpen)}
          >
            {panelOpen ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <ChevronLeft className="w-4 h-4" />
            )}
            Components
          </Button>
        </div>
      </div>

      {/* Main content area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Tldraw canvas — absolute inner div ensures Safari/iOS gets explicit dimensions */}
        <div className="flex-1 relative" style={{ minHeight: 0 }}>
          <div className="absolute inset-0">
            <Tldraw
              hideUi={hideTools}
              onMount={(editor) => {
                editorRef.current = editor;
                if (canvas?.components.length) {
                  // Fire-and-forget: fetch deps then populate
                  // (onMount must NOT return a Promise — tldraw expects void or cleanup fn)
                  void (async () => {
                    try {
                      const depGraph = await api.get<{
                        nodes: Array<{
                          id: string;
                          name: string;
                          component_type: string;
                        }>;
                        edges: DependencyEdge[];
                      }>(`/projects/${projectId}/dependencies`);
                      const canvasCompIds = new Set(
                        canvas.components.map((c) => c.id),
                      );
                      const relevantEdges = depGraph.edges.filter(
                        (e) =>
                          canvasCompIds.has(e.source_id) &&
                          canvasCompIds.has(e.target_id),
                      );
                      populateTldrawShapes(
                        editor,
                        canvas.components,
                        relevantEdges,
                      );
                    } catch {
                      populateTldrawShapes(editor, canvas.components);
                    }
                  })();
                }
              }}
            />
          </div>
        </div>

        {/* Side panel */}
        {panelOpen && (
          <div className="hidden lg:flex w-80 border-l border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex-col overflow-hidden shrink-0">
            {/* Add component form */}
            <div className="p-4 border-b border-gray-200 dark:border-gray-800">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
                Add Component
              </h2>
              <form onSubmit={handleAddComponent} className="space-y-3">
                <div>
                  <label
                    htmlFor="compName"
                    className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1"
                  >
                    Name <span className="text-red-500">*</span>
                  </label>
                  <Input
                    id="compName"
                    type="text"
                    value={compName}
                    onChange={(e) => setCompName(e.target.value)}
                    placeholder="e.g. User Service"
                    className="py-1.5"
                  />
                </div>

                <div>
                  <label
                    htmlFor="compType"
                    className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1"
                  >
                    Type
                  </label>
                  <Select
                    id="compType"
                    value={compType}
                    onChange={(e) =>
                      setCompType(e.target.value as ComponentType)
                    }
                    className="py-1.5"
                  >
                    {COMPONENT_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t.charAt(0).toUpperCase() + t.slice(1)}
                      </option>
                    ))}
                  </Select>
                </div>

                <div>
                  <label
                    htmlFor="compTech"
                    className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1"
                  >
                    Tech Stack
                  </label>
                  <Input
                    id="compTech"
                    type="text"
                    value={compTechStack}
                    onChange={(e) => setCompTechStack(e.target.value)}
                    placeholder="e.g. FastAPI, PostgreSQL"
                    className="py-1.5"
                  />
                </div>

                <div>
                  <label
                    htmlFor="compDesc"
                    className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1"
                  >
                    Description
                  </label>
                  <TextArea
                    id="compDesc"
                    value={compDescription}
                    onChange={(e) => setCompDescription(e.target.value)}
                    placeholder="What does this component do?"
                    rows={2}
                    className="py-1.5 resize-none"
                  />
                </div>

                <Button
                  type="submit"
                  size="sm"
                  loading={adding}
                  className="w-full"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Component
                </Button>
              </form>
            </div>

            {/* Components list */}
            <div className="flex-1 overflow-y-auto p-4">
              <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                Components ({canvas.components.length})
              </h2>

              {canvas.components.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-6">
                  No components yet. Add one above.
                </p>
              ) : (
                <div className="space-y-2">
                  {canvas.components.map((comp) => {
                    const ct = comp.component_type as ComponentType;
                    return (
                      <div
                        key={comp.id}
                        className="rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 p-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className={`inline-flex items-center justify-center w-7 h-7 rounded-md shrink-0 ${typeColors[ct] || typeColors.service}`}
                            >
                              {typeIcons[ct] || <Globe className="w-4 h-4" />}
                            </span>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                {comp.name}
                              </p>
                              <p className="text-xs text-gray-500 dark:text-gray-400">
                                {comp.component_type}
                                {comp.tech_stack && ` - ${comp.tech_stack}`}
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={() => handleDeleteComponent(comp.id)}
                            className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors shrink-0"
                            title="Remove component"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        {comp.description && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 line-clamp-2">
                            {comp.description}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
