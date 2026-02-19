import React from "react";
import { cn } from "../../lib/utils";

interface Props {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  hover?: boolean;
}

export function Card({ children, className, onClick, hover }: Props) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4",
        hover &&
          "cursor-pointer hover:border-teal/50 hover:shadow-lg hover:shadow-teal/5 transition-all duration-200",
        onClick && "cursor-pointer",
        className,
      )}
    >
      {children}
    </div>
  );
}
