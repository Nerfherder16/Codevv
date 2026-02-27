import React, { useState, useEffect } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { useTheme } from "../../contexts/ThemeContext";
import { Sun, Moon, LogOut, Search } from "lucide-react";
import { useAIChat } from "../../contexts/AIChatContext";
import { SearchModal } from "../common/SearchModal";
import { useParams } from "react-router-dom";

export function TopBar() {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const { toggle: toggleAI } = useAIChat();
  const { projectId } = useParams<{ projectId: string }>();
  const [searchOpen, setSearchOpen] = useState(false);

  // Cmd+K / Ctrl+K global shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        if (projectId) setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [projectId]);

  return (
    <>
      <header className="h-14 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between px-3 sm:px-6 bg-white dark:bg-gray-900/50">
        <div className="sm:hidden">
          <img src="/codevvtransrev.png" alt="Codevv" className="h-7 w-auto" />
        </div>

        {/* Search trigger — only when inside a project */}
        {projectId ? (
          <button
            onClick={() => setSearchOpen(true)}
            className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-white/[0.08] bg-gray-50 dark:bg-white/[0.03] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-white/[0.12] transition-colors text-sm"
          >
            <Search className="w-3.5 h-3.5" />
            <span className="text-xs">Search...</span>
            <kbd className="ml-4 flex items-center gap-0.5 px-1.5 py-0.5 rounded border border-gray-200 dark:border-white/[0.08] text-[10px] font-mono text-gray-400">
              ⌘K
            </kbd>
          </button>
        ) : (
          <div className="hidden sm:block" />
        )}

        <div className="flex items-center gap-3">
          {projectId && (
            <button
              onClick={() => setSearchOpen(true)}
              className="sm:hidden p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              title="Search (Ctrl+K)"
            >
              <Search className="w-4 h-4 text-teal" />
            </button>
          )}
          <button
            onClick={toggle}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            title="Toggle theme"
          >
            {theme === "dark" ? (
              <Sun className="w-4 h-4 text-teal" />
            ) : (
              <Moon className="w-4 h-4 text-teal" />
            )}
          </button>
          {user && (
            <>
              <div className="flex items-center gap-2 text-sm">
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-teal to-coral flex items-center justify-center text-white text-xs font-bold">
                  {user.display_name?.[0]?.toUpperCase() || "U"}
                </div>
                <span>{user.display_name}</span>
              </div>
              <button
                onClick={logout}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                title="Logout"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      </header>

      <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}
