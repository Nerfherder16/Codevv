import React from "react";
import { NavLink, useParams } from "react-router-dom";
import {
  LayoutDashboard,
  Pencil,
  Lightbulb,
  Video,
  Ellipsis,
} from "lucide-react";
import { cn } from "../../lib/utils";

const NAV_ITEMS = [
  { to: "", icon: LayoutDashboard, label: "Overview", end: true },
  { to: "canvas", icon: Pencil, label: "Canvas" },
  { to: "ideas", icon: Lightbulb, label: "Ideas" },
  { to: "rooms", icon: Video, label: "Rooms" },
];

export function MobileBottomNav() {
  const { projectId } = useParams();
  const basePath = projectId ? `/projects/${projectId}` : "/";
  const [moreOpen, setMoreOpen] = React.useState(false);

  return (
    <>
      {/* More menu overlay */}
      {moreOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm sm:hidden"
          onClick={() => setMoreOpen(false)}
        />
      )}

      {/* More menu panel */}
      {moreOpen && (
        <div className="fixed bottom-16 left-0 right-0 z-50 sm:hidden px-3 pb-1">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-xl p-2 grid grid-cols-4 gap-1">
            {[
              { to: "scaffold", label: "Scaffold" },
              { to: "knowledge", label: "Knowledge" },
              { to: "documents", label: "Docs" },
              { to: "pipeline", label: "Pipeline" },
              { to: "dependencies", label: "Deps" },
              { to: "deploy", label: "Deploy" },
              { to: "rules", label: "Rules" },
              { to: "settings", label: "Settings" },
            ].map((item) => (
              <NavLink
                key={item.to}
                to={`${basePath}/${item.to}`}
                onClick={() => setMoreOpen(false)}
                className={({ isActive }) =>
                  cn(
                    "flex flex-col items-center gap-1 py-2 px-1 rounded-lg text-[10px] font-medium transition-colors",
                    isActive
                      ? "text-teal bg-teal/10"
                      : "text-gray-500 dark:text-gray-400",
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </div>
        </div>
      )}

      {/* Bottom nav bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 sm:hidden border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 safe-area-bottom">
        <div className="flex items-center justify-around h-14">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={`${basePath}/${item.to}`}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  "flex flex-col items-center gap-0.5 px-3 py-1.5 min-w-[48px] transition-colors",
                  isActive
                    ? "text-teal"
                    : "text-gray-400 dark:text-gray-500 active:text-gray-600",
                )
              }
            >
              <item.icon className="w-5 h-5" />
              <span className="text-[10px] font-medium">{item.label}</span>
            </NavLink>
          ))}
          <button
            onClick={() => setMoreOpen((p) => !p)}
            className={cn(
              "flex flex-col items-center gap-0.5 px-3 py-1.5 min-w-[48px] transition-colors",
              moreOpen
                ? "text-teal"
                : "text-gray-400 dark:text-gray-500 active:text-gray-600",
            )}
          >
            <Ellipsis className="w-5 h-5" />
            <span className="text-[10px] font-medium">More</span>
          </button>
        </div>
      </nav>
    </>
  );
}
