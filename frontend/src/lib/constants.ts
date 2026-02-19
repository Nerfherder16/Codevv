export const STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20",
  completed: "bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20",
  in_progress: "bg-teal/10 text-teal ring-1 ring-teal/20",
  planning: "bg-violet-500/10 text-violet-400 ring-1 ring-violet-500/20",
  on_hold: "bg-yellow-500/10 text-yellow-400 ring-1 ring-yellow-500/20",
  archived: "bg-gray-500/10 text-gray-400 ring-1 ring-gray-500/20",
  draft: "bg-gray-500/10 text-gray-400 ring-1 ring-gray-500/20",
  pending: "bg-yellow-500/10 text-yellow-400 ring-1 ring-yellow-500/20",
  review: "bg-teal/10 text-teal ring-1 ring-teal/20",
  approved: "bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20",
  rejected: "bg-red-500/10 text-red-400 ring-1 ring-red-500/20",
  generating: "bg-violet-500/10 text-violet-400 ring-1 ring-violet-500/20",
};

export const ROLE_COLORS: Record<string, string> = {
  owner: "bg-teal/10 text-teal ring-1 ring-teal/20",
  admin: "bg-violet-500/10 text-violet-400 ring-1 ring-violet-500/20",
  editor: "bg-blue-500/10 text-blue-400 ring-1 ring-blue-500/20",
  viewer: "bg-gray-500/10 text-gray-400 ring-1 ring-gray-500/20",
};

export const SCAFFOLD_STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-500/10 text-gray-400 ring-1 ring-gray-500/20",
  review: "bg-teal/10 text-teal ring-1 ring-teal/20",
  approved: "bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20",
  generating: "bg-violet-500/10 text-violet-400 ring-1 ring-violet-500/20",
  complete: "bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20",
};

export const DEPLOY_STATUS_COLORS: Record<string, string> = {
  success:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
  failed: "bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400",
  running: "bg-teal/10 text-teal ring-1 ring-teal/20",
  cancelled:
    "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/10 dark:text-yellow-400",
  pending: "bg-gray-100 text-gray-700 dark:bg-gray-500/10 dark:text-gray-400",
};
