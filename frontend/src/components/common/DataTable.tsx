import React, { useState } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";
import { cn } from "../../lib/utils";

export interface Column<T> {
  key: keyof T | string;
  label: string;
  align?: "left" | "center" | "right";
  sortable?: boolean;
  render?: (row: T) => React.ReactNode;
}

interface DataTableProps<T extends { id: string | number }> {
  columns: Column<T>[];
  data: T[];
  onRowClick?: (row: T) => void;
  emptyMessage?: string;
}

type SortDirection = "asc" | "desc";

interface SortState {
  key: string;
  direction: SortDirection;
}

const alignClass = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
};

export function DataTable<T extends { id: string | number }>({
  columns,
  data,
  onRowClick,
  emptyMessage = "No data available.",
}: DataTableProps<T>) {
  const [sort, setSort] = useState<SortState | null>(null);

  const handleSort = (key: string) => {
    setSort((prev) =>
      prev?.key === key
        ? { key, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { key, direction: "asc" },
    );
  };

  const sorted = sort
    ? [...data].sort((a, b) => {
        const aVal = (a as Record<string, unknown>)[sort.key];
        const bVal = (b as Record<string, unknown>)[sort.key];
        if (aVal == null && bVal == null) return 0;
        if (aVal == null) return 1;
        if (bVal == null) return -1;
        const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
        return sort.direction === "asc" ? cmp : -cmp;
      })
    : data;

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-700">
            {columns.map((col) => {
              const key = String(col.key);
              const isActive = sort?.key === key;
              return (
                <th
                  key={key}
                  className={cn(
                    "sticky top-0 bg-white dark:bg-gray-900 px-4 py-3",
                    "text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400",
                    alignClass[col.align ?? "left"],
                    col.sortable &&
                      "cursor-pointer select-none hover:text-gray-700 dark:hover:text-gray-200",
                  )}
                  onClick={col.sortable ? () => handleSort(key) : undefined}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    {col.sortable && (
                      <span className="inline-flex flex-col">
                        {isActive && sort?.direction === "asc" ? (
                          <ChevronUp className="w-3 h-3" />
                        ) : isActive && sort?.direction === "desc" ? (
                          <ChevronDown className="w-3 h-3" />
                        ) : (
                          <ChevronUp className="w-3 h-3 opacity-30" />
                        )}
                      </span>
                    )}
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-4 py-10 text-center text-sm text-gray-500 dark:text-gray-400"
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            sorted.map((row) => (
              <tr
                key={row.id}
                className={cn(
                  "border-b border-gray-200 dark:border-gray-700 last:border-0",
                  "hover:bg-gray-50 dark:hover:bg-gray-800/50",
                  onRowClick && "cursor-pointer",
                )}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {columns.map((col) => {
                  const key = String(col.key);
                  const value = (row as Record<string, unknown>)[key];
                  return (
                    <td
                      key={key}
                      className={cn(
                        "px-4 py-3 text-sm text-gray-700 dark:text-gray-300",
                        alignClass[col.align ?? "left"],
                      )}
                    >
                      {col.render
                        ? col.render(row)
                        : (value as React.ReactNode)}
                    </td>
                  );
                })}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
