import React from "react";
import { cn } from "../../lib/utils";

const variants = {
  default: "bg-gray-500/10 text-gray-400 ring-1 ring-gray-500/20",
  teal: "bg-teal/10 text-teal ring-1 ring-teal/20",
  coral: "bg-coral/10 text-coral ring-1 ring-coral/20",
  success: "bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20",
  info: "bg-blue-500/10 text-blue-400 ring-1 ring-blue-500/20",
  purple: "bg-violet-500/10 text-violet-400 ring-1 ring-violet-500/20",
  warning: "bg-yellow-500/10 text-yellow-400 ring-1 ring-yellow-500/20",
};

const sizes = {
  sm: "text-[10px] px-1.5 py-0.5",
  md: "text-xs px-2.5 py-1",
};

interface Props {
  children: React.ReactNode;
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  className?: string;
}

export function Badge({
  children,
  variant = "default",
  size = "sm",
  className,
}: Props) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 font-medium rounded-full whitespace-nowrap",
        variants[variant],
        sizes[size],
        className,
      )}
    >
      {children}
    </span>
  );
}
