import React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "../../lib/utils";

export function LoadingSpinner({ className }: { className?: string }) {
  return (
    <Loader2 className={cn("w-6 h-6 animate-spin text-teal", className)} />
  );
}

export function PageLoading() {
  return (
    <div className="flex items-center justify-center h-64">
      <LoadingSpinner className="w-8 h-8" />
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded-lg bg-gray-200 dark:bg-gray-800 skeleton",
        className,
      )}
    />
  );
}
