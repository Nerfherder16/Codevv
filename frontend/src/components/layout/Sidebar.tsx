import React, { useState, useEffect, useCallback } from "react";
import { NavLink, useParams } from "react-router-dom";
import {
  LayoutDashboard,
  Pencil,
  Lightbulb,
  Code2,
  Share2,
  Video,
  Rocket,
  Settings,
  BookOpen,
  GitBranch,
  Workflow,
  Coins,
  ClipboardCheck,
  Shield,
  FileText,
  Terminal,
  MessageSquare,
  CheckSquare,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { api } from "../../lib/api";
import { useAuth } from "../../contexts/AuthContext";
import { useEventStreamContext } from "../../contexts/EventStreamContext";
import type { ProjectMember } from "../../types";

interface NavItem {
  to: string;
  icon: React.ElementType;
  label: string;
  end?: boolean;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const CORE_GROUP: NavGroup = {
  label: "Core",
  items: [
    { to: "", icon: LayoutDashboard, label: "Overview", end: true },
    { to: "chat", icon: MessageSquare, label: "AI Chat" },
    { to: "tasks", icon: CheckSquare, label: "Tasks" },
    { to: "canvas", icon: Pencil, label: "Canvas" },
    { to: "ideas", icon: Lightbulb, label: "Idea Vault" },
    { to: "knowledge", icon: Share2, label: "Knowledge Graph" },
    { to: "documents", icon: FileText, label: "Documents" },
  ],
};

const BUILD_GROUP: NavGroup = {
  label: "Build",
  items: [
    { to: "scaffold", icon: Code2, label: "Code Scaffold" },
    { to: "pipeline", icon: Workflow, label: "Pipeline" },
    { to: "dependencies", icon: GitBranch, label: "Dependency Map" },
    { to: "workspace", icon: Terminal, label: "Workspace" },
    { to: "deploy", icon: Rocket, label: "Deploy" },
  ],
};

const PLATFORM_GROUP: NavGroup = {
  label: "Platform",
  items: [
    { to: "rules", icon: BookOpen, label: "Business Rules" },
    { to: "solana", icon: Coins, label: "Blockchain" },
    { to: "rooms", icon: Video, label: "Video Rooms" },
  ],
};

const OPERATIONS_GROUP: NavGroup = {
  label: "Operations",
  items: [
    { to: "audit", icon: ClipboardCheck, label: "Audit Prep" },
    { to: "compliance", icon: Shield, label: "Launch Readiness" },
  ],
};

// Default order: developer-first
const DEFAULT_ORDER: NavGroup[] = [
  CORE_GROUP,
  BUILD_GROUP,
  PLATFORM_GROUP,
  OPERATIONS_GROUP,
];

function getGroupsForPersona(persona: string | null | undefined): NavGroup[] {
  switch (persona) {
    case "creator":
      // Creators care about content, rules, knowledge before code
      return [CORE_GROUP, PLATFORM_GROUP, BUILD_GROUP, OPERATIONS_GROUP];
    case "finance":
    case "operations":
      // Finance/ops care about validation and compliance first
      return [CORE_GROUP, OPERATIONS_GROUP, PLATFORM_GROUP, BUILD_GROUP];
    case "developer":
    default:
      return DEFAULT_ORDER;
  }
}

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem("bh-sidebar") === "collapsed",
  );
  const { projectId } = useParams();
  const { user } = useAuth();
  const { badgeCounts } = useEventStreamContext();
  const overviewBadge = projectId ? (badgeCounts[projectId] ?? 0) : 0;
  const basePath = projectId ? `/projects/${projectId}` : "/";

  const [navGroups, setNavGroups] = useState<NavGroup[]>(DEFAULT_ORDER);

  const loadPersona = useCallback(async () => {
    if (!projectId || !user) return;
    try {
      const members = await api.get<ProjectMember[]>(
        `/projects/${projectId}/members`,
      );
      const me = members.find((m) => m.user_id === user.id);
      if (me?.persona) {
        setNavGroups(getGroupsForPersona(me.persona));
      }
    } catch {
      // Silent fail — keep default order
    }
  }, [projectId, user]);

  useEffect(() => {
    loadPersona();
  }, [loadPersona]);

  const toggleCollapse = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("bh-sidebar", next ? "collapsed" : "expanded");
  };

  return (
    <aside
      className={cn(
        "h-screen sticky top-0 relative bg-gray-100 dark:bg-gray-900 flex flex-col transition-all duration-200",
        collapsed ? "w-16" : "w-60",
      )}
    >
      {/* Right edge — full-height toggle with split border + notch */}
      <button
        onClick={toggleCollapse}
        className="absolute right-0 top-0 bottom-0 w-3 z-20 flex items-center cursor-pointer group"
      >
        <div
          className="absolute right-0 top-0 w-px bg-gray-200 dark:bg-gray-800"
          style={{ height: "calc(50% - 9px)" }}
        />
        <div
          className="absolute right-0 bottom-0 w-px bg-gray-200 dark:bg-gray-800"
          style={{ height: "calc(50% - 9px)" }}
        />
        <svg
          width="28"
          height="44"
          viewBox="0 0 28 44"
          className="absolute top-1/2 -translate-y-1/2 block"
          style={{ right: "-14px" }}
        >
          {collapsed ? (
            <>
              {/* Fill: sidebar grey */}
              <path
                d="M 14 13 L 26 22 L 14 31 Z"
                className="fill-gray-100 dark:fill-gray-900"
                stroke="none"
              />
              {/* Chevron strokes */}
              <path
                d="M 14 13 L 26 22 L 14 31"
                fill="none"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="stroke-gray-200 dark:stroke-gray-800 group-hover:stroke-white transition-colors"
              />
            </>
          ) : (
            <>
              {/* Fill: page black */}
              <path
                d="M 14 13 L 2 22 L 14 31 Z"
                className="fill-white dark:fill-gray-950"
                stroke="none"
              />
              {/* Chevron strokes */}
              <path
                d="M 14 13 L 2 22 L 14 31"
                fill="none"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="stroke-gray-200 dark:stroke-gray-800 group-hover:stroke-white transition-colors"
              />
            </>
          )}
        </svg>
      </button>

      {/* Header */}
      <div
        className={cn(
          "flex items-center justify-center shrink-0",
          collapsed ? "p-2 pt-4" : "px-3 pt-4 pb-1.5",
        )}
      >
        {collapsed ? (
          <img
            src="/codevvtransrev.png"
            alt="Codevv"
            className="w-full object-contain"
          />
        ) : (
          <img
            src="/codevvrevlogo.png"
            alt="Codevv"
            className="w-full max-h-10 object-contain"
          />
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-2 overflow-y-auto relative z-0">
        {navGroups.map((group) => (
          <div key={group.label} className="mb-1">
            {!collapsed && (
              <div className="px-4 pt-4 pb-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-400 dark:text-gray-600">
                  {group.label}
                </span>
              </div>
            )}
            {collapsed && <div className="pt-2" />}
            {group.items.map((item) => (
              <NavLink
                key={item.to}
                to={`${basePath}/${item.to}`}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 px-4 py-2 mx-2 rounded-lg text-sm transition-colors relative",
                    isActive
                      ? "bg-teal/10 text-teal font-medium nav-active"
                      : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-white/[0.04]",
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-teal rounded-r" />
                    )}
                    <item.icon className="w-5 h-5 shrink-0" />
                    {!collapsed && (
                      <span className="truncate">{item.label}</span>
                    )}
                    {item.end && overviewBadge > 0 && (
                      <span className="ml-auto min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-[var(--accent-primary)] text-[var(--bg-page)] text-[10px] font-bold px-1">
                        {overviewBadge > 99 ? "99+" : overviewBadge}
                      </span>
                    )}
                  </>
                )}
              </NavLink>
            ))}
          </div>
        ))}

        {/* Settings — always at the bottom of nav */}
        <div className="mt-auto pt-2 border-t border-gray-200 dark:border-gray-800 mx-2">
          <NavLink
            to={`${basePath}/settings`}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 px-4 py-2 rounded-lg text-sm transition-colors relative",
                isActive
                  ? "bg-teal/10 text-teal font-medium nav-active"
                  : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-white/[0.04]",
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-teal rounded-r" />
                )}
                <Settings className="w-5 h-5 shrink-0" />
                {!collapsed && <span className="truncate">Settings</span>}
              </>
            )}
          </NavLink>
        </div>
      </nav>
    </aside>
  );
}
