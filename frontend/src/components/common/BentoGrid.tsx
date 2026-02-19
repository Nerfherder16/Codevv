import React from "react";
import { cn } from "../../lib/utils";

interface BentoGridProps extends React.HTMLAttributes<HTMLDivElement> {}

export function BentoGrid({ className, children, ...props }: BentoGridProps) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4",
        "auto-rows-[minmax(180px,auto)] gap-4",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

interface BentoItemProps extends React.HTMLAttributes<HTMLDivElement> {
  colSpan?: 1 | 2 | 3 | 4;
  rowSpan?: 1 | 2;
}

const colSpanMap: Record<number, string> = {
  1: "lg:col-span-1",
  2: "sm:col-span-2 lg:col-span-2",
  3: "sm:col-span-2 lg:col-span-3",
  4: "sm:col-span-2 lg:col-span-4",
};

const rowSpanMap: Record<number, string> = {
  1: "row-span-1",
  2: "row-span-2",
};

export function BentoItem({
  className,
  children,
  colSpan = 1,
  rowSpan = 1,
  ...props
}: BentoItemProps) {
  return (
    <div
      className={cn(colSpanMap[colSpan], rowSpanMap[rowSpan], className)}
      {...props}
    >
      {children}
    </div>
  );
}
