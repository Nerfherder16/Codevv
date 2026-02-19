import React from "react";
import { cn } from "../../lib/utils";

const baseInput =
  "w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/20 transition-colors";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

export function Input({ className, error, ...props }: InputProps) {
  return (
    <input
      className={cn(
        baseInput,
        error && "border-red-500 focus:border-red-500 focus:ring-red-500/20",
        className,
      )}
      {...props}
    />
  );
}

interface TextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
}

export function TextArea({ className, error, ...props }: TextAreaProps) {
  return (
    <textarea
      className={cn(
        baseInput,
        "resize-none",
        error && "border-red-500 focus:border-red-500 focus:ring-red-500/20",
        className,
      )}
      {...props}
    />
  );
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean;
}

export function Select({ className, error, children, ...props }: SelectProps) {
  return (
    <select
      className={cn(
        baseInput,
        "cursor-pointer",
        error && "border-red-500 focus:border-red-500 focus:ring-red-500/20",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}
