import React from "react";
import { cn } from "../../lib/utils";
import { Button } from "./Button";

interface Props {
  icon?: React.ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  className,
}: Props) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-16 px-4 text-center",
        className,
      )}
    >
      {icon && <div className="mb-6 text-teal/60">{icon}</div>}
      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
        {title}
      </h3>
      <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm mb-6">
        {description}
      </p>
      {actionLabel && onAction && (
        <Button onClick={onAction} className="btn-glow text-white">
          {actionLabel}
        </Button>
      )}
    </div>
  );
}

/* SVG illustration components for each page's empty state */

export function FolderIllustration() {
  return (
    <svg
      width="80"
      height="80"
      viewBox="0 0 80 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect
        x="10"
        y="24"
        width="60"
        height="42"
        rx="4"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M10 28V18a4 4 0 014-4h18l6 10H10z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <circle cx="40" cy="45" r="6" stroke="#00AFB9" strokeWidth="2" />
      <path
        d="M40 41v8M36 45h8"
        stroke="#00AFB9"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function CanvasIllustration() {
  return (
    <svg
      width="80"
      height="80"
      viewBox="0 0 80 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect
        x="12"
        y="12"
        width="56"
        height="56"
        rx="4"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M50 20L26 60"
        stroke="#00AFB9"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path d="M24 22l4-4 30 30-4 4z" stroke="#F07167" strokeWidth="2" />
      <circle cx="58" cy="52" r="3" stroke="#00AFB9" strokeWidth="2" />
    </svg>
  );
}

export function LightbulbIllustration() {
  return (
    <svg
      width="80"
      height="80"
      viewBox="0 0 80 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M40 12a20 20 0 00-8 38.4V56h16v-5.6A20 20 0 0040 12z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <rect
        x="32"
        y="58"
        width="16"
        height="6"
        rx="2"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M36 64h8v2a4 4 0 01-8 0v-2z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M40 4v4M60 12l-3 3M68 32h-4M16 32h-4M23 12l3 3"
        stroke="#00AFB9"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function CodeIllustration() {
  return (
    <svg
      width="80"
      height="80"
      viewBox="0 0 80 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M28 28L14 40l14 12"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M52 28l14 12-14 12"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M46 18L34 62"
        stroke="#00AFB9"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M60 14l6 6-6 6"
        stroke="#F07167"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function GraphIllustration() {
  return (
    <svg
      width="80"
      height="80"
      viewBox="0 0 80 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="40" cy="20" r="6" stroke="#00AFB9" strokeWidth="2" />
      <circle cx="20" cy="50" r="6" stroke="currentColor" strokeWidth="2" />
      <circle cx="60" cy="50" r="6" stroke="currentColor" strokeWidth="2" />
      <circle cx="40" cy="65" r="4" stroke="#F07167" strokeWidth="2" />
      <path
        d="M36 25L24 45M44 25l12 20M24 55l14 8M56 55L42 63"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.5"
      />
    </svg>
  );
}

export function VideoIllustration() {
  return (
    <svg
      width="80"
      height="80"
      viewBox="0 0 80 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect
        x="8"
        y="22"
        width="44"
        height="36"
        rx="4"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path d="M52 32l16-8v32l-16-8V32z" stroke="#00AFB9" strokeWidth="2" />
      <circle cx="30" cy="40" r="3" fill="#F07167" />
      <circle cx="18" cy="16" r="2" stroke="#00AFB9" strokeWidth="1.5" />
      <circle cx="62" cy="18" r="2" stroke="#F07167" strokeWidth="1.5" />
    </svg>
  );
}

export function RocketIllustration() {
  return (
    <svg
      width="80"
      height="80"
      viewBox="0 0 80 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M40 8c-8 12-12 28-12 40h24c0-12-4-28-12-40z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M28 48l-8 12h8V48zM52 48l8 12h-8V48z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <circle cx="40" cy="32" r="4" stroke="#00AFB9" strokeWidth="2" />
      <path d="M36 60h8v6a4 4 0 01-8 0v-6z" stroke="#F07167" strokeWidth="2" />
      <path
        d="M34 68l-2 4M46 68l2 4M40 70v4"
        stroke="#F07167"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
