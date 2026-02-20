import React from "react";
import { useAuth } from "../../contexts/AuthContext";
import { useTheme } from "../../contexts/ThemeContext";
import { Sun, Moon, LogOut, User } from "lucide-react";

export function TopBar() {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();

  return (
    <header className="h-14 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between px-3 sm:px-6 bg-white dark:bg-gray-900/50">
      <div className="sm:hidden">
        <img src="/codevvtransrev.png" alt="Codevv" className="h-7 w-auto" />
      </div>
      <div className="hidden sm:block" />
      <div className="flex items-center gap-3">
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
  );
}
