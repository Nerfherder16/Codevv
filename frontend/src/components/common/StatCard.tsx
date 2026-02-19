import React from "react";
import { TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "../../lib/utils";

interface StatCardProps {
  label: string;
  value: string | number;
  change?: number;
  sparkline?: number[];
  accent?: string;
  className?: string;
}

function Sparkline({ data }: { data: number[] }) {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const width = 80;
  const height = 28;
  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((v - min) / range) * height;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg width={width} height={height} className="opacity-60">
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function StatCard({
  label,
  value,
  change,
  sparkline,
  accent = "border-teal",
  className,
}: StatCardProps) {
  const isPositive = change !== undefined && change >= 0;
  const isNegative = change !== undefined && change < 0;

  return (
    <div
      className={cn(
        "rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4",
        "border-l-4",
        accent,
        "transition-all duration-200",
        className,
      )}
    >
      <p className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">
        {label}
      </p>

      <div className="flex items-end justify-between gap-2">
        <span className="font-mono text-3xl font-light text-gray-900 dark:text-gray-100 leading-none">
          {value}
        </span>

        {sparkline && sparkline.length > 1 && (
          <div className="text-gray-400 dark:text-gray-500">
            <Sparkline data={sparkline} />
          </div>
        )}
      </div>

      {change !== undefined && (
        <div className="mt-2 flex items-center gap-1">
          {isPositive ? (
            <TrendingUp className="w-3 h-3 text-emerald-400" />
          ) : (
            <TrendingDown className="w-3 h-3 text-red-400" />
          )}
          <span
            className={cn(
              "text-xs font-medium",
              isPositive && "text-emerald-400",
              isNegative && "text-red-400",
            )}
          >
            {isPositive ? "+" : ""}
            {change.toFixed(1)}%
          </span>
        </div>
      )}
    </div>
  );
}
