import React, { useState } from "react";
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
  ChevronLeft,
  ChevronRight,
  BookOpen,
  GitBranch,
  Workflow,
  Coins,
  ClipboardCheck,
  Shield,
} from "lucide-react";
import { cn } from "../../lib/utils";

const NAV_ITEMS = [
  { to: "", icon: LayoutDashboard, label: "Overview", end: true },
  { to: "rules", icon: BookOpen, label: "Business Rules" },
  { to: "canvas", icon: Pencil, label: "Canvas" },
  { to: "ideas", icon: Lightbulb, label: "Idea Vault" },
  { to: "scaffold", icon: Code2, label: "Code Scaffold" },
  { to: "knowledge", icon: Share2, label: "Knowledge Graph" },
  { to: "dependencies", icon: GitBranch, label: "Dependency Map" },
  { to: "pipeline", icon: Workflow, label: "Pipeline" },
  { to: "solana", icon: Coins, label: "Blockchain" },
  { to: "rooms", icon: Video, label: "Video Rooms" },
  { to: "deploy", icon: Rocket, label: "Deploy" },
  { to: "audit", icon: ClipboardCheck, label: "Audit Prep" },
  { to: "compliance", icon: Shield, label: "Launch Readiness" },
  { to: "settings", icon: Settings, label: "Settings" },
];

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem("bh-sidebar") === "collapsed",
  );
  const { projectId } = useParams();
  const basePath = projectId ? `/projects/${projectId}` : "/";

  const toggleCollapse = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("bh-sidebar", next ? "collapsed" : "expanded");
  };

  return (
    <aside
      className={cn(
        "h-screen sticky top-0 bg-gray-100 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 flex flex-col transition-all duration-200",
        collapsed ? "w-16" : "w-60",
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2 p-4 border-b border-gray-200 dark:border-gray-800">
        <img
          src="/foundrylogo.png"
          alt="Foundry"
          className="w-9 h-9 shrink-0 rounded"
        />
        {!collapsed && (
          <span className="font-bold text-lg truncate">Foundry</span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-2 overflow-y-auto">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={`${basePath}/${item.to}`}
            end={item.end}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 px-4 py-2.5 mx-2 rounded-lg text-sm transition-colors relative",
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
                {!collapsed && <span className="truncate">{item.label}</span>}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Collapse toggle */}
      <button
        onClick={toggleCollapse}
        className="p-3 border-t border-gray-200 dark:border-gray-800 hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
      >
        {collapsed ? (
          <ChevronRight className="w-5 h-5 mx-auto" />
        ) : (
          <ChevronLeft className="w-5 h-5 mx-auto" />
        )}
      </button>
    </aside>
  );
}
