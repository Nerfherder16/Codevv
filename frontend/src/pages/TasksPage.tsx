import React, { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import {
  Plus,
  CheckSquare,
  Filter,
  LayoutGrid,
  List,
  ChevronDown,
  X,
  AlertCircle,
  Clock,
  Flag,
  User,
  Calendar,
} from "lucide-react";
import { api } from "../lib/api";
import type { Task, TaskStatus, TaskPriority } from "../types";
import { useAuth } from "../contexts/AuthContext";

const STATUS_COLUMNS: { key: TaskStatus; label: string; color: string }[] = [
  { key: "todo", label: "To Do", color: "border-zinc-600" },
  { key: "in_progress", label: "In Progress", color: "border-blue-500" },
  { key: "blocked", label: "Blocked", color: "border-rose-500" },
  { key: "done", label: "Done", color: "border-emerald-500" },
];

const PRIORITY_COLORS: Record<TaskPriority, string> = {
  low: "text-zinc-400",
  medium: "text-amber-400",
  high: "text-orange-400",
  urgent: "text-rose-400",
};

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

interface TaskCardProps {
  task: Task;
  onUpdate: (taskId: string, data: Partial<Task>) => void;
  onDelete: (taskId: string) => void;
}

function TaskCard({ task, onUpdate, onDelete }: TaskCardProps) {
  const isOverdue =
    task.due_date &&
    task.status !== "done" &&
    new Date(task.due_date) < new Date();

  return (
    <div className="bg-[#1e1b2e] border border-white/[0.08] rounded-lg p-3 space-y-2 hover:border-white/[0.14] transition-colors group">
      <div className="flex items-start justify-between gap-2">
        <p
          className={`text-sm font-medium leading-snug ${task.status === "done" ? "line-through text-zinc-500" : "text-zinc-100"}`}
        >
          {task.title}
        </p>
        <button
          onClick={() => onDelete(task.id)}
          className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-rose-400 transition-all shrink-0"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {task.description && (
        <p className="text-xs text-zinc-500 line-clamp-2">{task.description}</p>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        {/* Priority */}
        <span
          className={`flex items-center gap-1 text-xs ${PRIORITY_COLORS[task.priority]}`}
        >
          <Flag className="w-3 h-3" />
          {PRIORITY_LABELS[task.priority]}
        </span>

        {/* Due date */}
        {task.due_date && (
          <span
            className={`flex items-center gap-1 text-xs ${isOverdue ? "text-rose-400" : "text-zinc-500"}`}
          >
            <Calendar className="w-3 h-3" />
            {new Date(task.due_date).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })}
          </span>
        )}

        {/* Assignee */}
        {task.assignee && (
          <span className="flex items-center gap-1 text-xs text-zinc-500">
            <User className="w-3 h-3" />
            {task.assignee.display_name.split(" ")[0]}
          </span>
        )}
      </div>

      {/* Status change */}
      <div className="flex gap-1 pt-1 border-t border-white/[0.05]">
        {STATUS_COLUMNS.map((col) => (
          <button
            key={col.key}
            onClick={() => onUpdate(task.id, { status: col.key })}
            className={`flex-1 text-xs py-0.5 rounded transition-colors ${
              task.status === col.key
                ? "bg-white/10 text-zinc-100"
                : "text-zinc-600 hover:text-zinc-400 hover:bg-white/[0.04]"
            }`}
          >
            {col.label.split(" ")[0]}
          </button>
        ))}
      </div>
    </div>
  );
}

interface CreateTaskModalProps {
  projectId: string;
  defaultStatus?: TaskStatus;
  onCreated: (task: Task) => void;
  onClose: () => void;
}

function CreateTaskModal({
  projectId,
  defaultStatus = "todo",
  onCreated,
  onClose,
}: CreateTaskModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<TaskStatus>(defaultStatus);
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const task = await api.tasks.create(projectId, {
        title: title.trim(),
        description: description.trim() || undefined,
        status,
        priority,
        due_date: dueDate || undefined,
      });
      onCreated(task);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create task");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-[#1e1b2e] border border-white/[0.1] rounded-xl p-6 w-full max-w-md shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-zinc-100">New Task</h2>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-300"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              autoFocus
              type="text"
              placeholder="Task title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-teal-500/50 focus:ring-1 focus:ring-teal-500/20"
            />
          </div>

          <div>
            <textarea
              placeholder="Description (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-teal-500/50 focus:ring-1 focus:ring-teal-500/20 resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-zinc-500 uppercase tracking-wide mb-1 block">
                Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as TaskStatus)}
                className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-teal-500/50"
              >
                <option value="todo">To Do</option>
                <option value="in_progress">In Progress</option>
                <option value="blocked">Blocked</option>
                <option value="done">Done</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-zinc-500 uppercase tracking-wide mb-1 block">
                Priority
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-teal-500/50"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs text-zinc-500 uppercase tracking-wide mb-1 block">
              Due Date
            </label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-teal-500/50"
            />
          </div>

          {error && (
            <p className="text-sm text-rose-400 flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5" />
              {error}
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 text-sm rounded-lg border border-white/[0.08] text-zinc-400 hover:bg-white/[0.04] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim() || saving}
              className="flex-1 py-2 text-sm rounded-lg bg-teal-600 hover:bg-teal-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium transition-colors"
            >
              {saving ? "Creating…" : "Create Task"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function TasksPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { user } = useAuth();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"board" | "list">("board");
  const [filterStatus, setFilterStatus] = useState<TaskStatus | "">("");
  const [filterPriority, setFilterPriority] = useState<TaskPriority | "">("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createDefaultStatus, setCreateDefaultStatus] =
    useState<TaskStatus>("todo");

  const fetchTasks = useCallback(async () => {
    if (!projectId) return;
    try {
      const data = await api.tasks.list(projectId);
      setTasks(data);
    } catch (err) {
      console.error("Failed to fetch tasks", err);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const handleUpdate = useCallback(
    async (taskId: string, data: Partial<Task>) => {
      if (!projectId) return;
      try {
        const updated = await api.tasks.update(
          projectId,
          taskId,
          data as Parameters<typeof api.tasks.update>[2],
        );
        setTasks((prev) => prev.map((t) => (t.id === taskId ? updated : t)));
      } catch (err) {
        console.error("Failed to update task", err);
      }
    },
    [projectId],
  );

  const handleDelete = useCallback(
    async (taskId: string) => {
      if (!projectId) return;
      try {
        await api.tasks.delete(projectId, taskId);
        setTasks((prev) => prev.filter((t) => t.id !== taskId));
      } catch (err) {
        console.error("Failed to delete task", err);
      }
    },
    [projectId],
  );

  const handleCreated = useCallback((task: Task) => {
    setTasks((prev) => [task, ...prev]);
    setShowCreateModal(false);
  }, []);

  const filtered = tasks.filter((t) => {
    if (filterStatus && t.status !== filterStatus) return false;
    if (filterPriority && t.priority !== filterPriority) return false;
    return true;
  });

  const tasksByStatus = STATUS_COLUMNS.reduce<Record<string, Task[]>>(
    (acc, col) => {
      acc[col.key] = filtered.filter((t) => t.status === col.key);
      return acc;
    },
    {},
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Clock className="w-5 h-5 text-zinc-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100 flex items-center gap-2">
            <CheckSquare className="w-5 h-5 text-teal-400" />
            Tasks
          </h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            {tasks.length} task{tasks.length !== 1 ? "s" : ""}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex items-center bg-white/[0.04] border border-white/[0.08] rounded-lg p-0.5">
            <button
              onClick={() => setView("board")}
              className={`p-1.5 rounded transition-colors ${view === "board" ? "bg-white/[0.1] text-zinc-100" : "text-zinc-500 hover:text-zinc-300"}`}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setView("list")}
              className={`p-1.5 rounded transition-colors ${view === "list" ? "bg-white/[0.1] text-zinc-100" : "text-zinc-500 hover:text-zinc-300"}`}
            >
              <List className="w-4 h-4" />
            </button>
          </div>

          {/* Filters */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as TaskStatus | "")}
            className="bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-1.5 text-xs text-zinc-400 focus:outline-none focus:border-teal-500/50"
          >
            <option value="">All Status</option>
            <option value="todo">To Do</option>
            <option value="in_progress">In Progress</option>
            <option value="blocked">Blocked</option>
            <option value="done">Done</option>
          </select>

          <select
            value={filterPriority}
            onChange={(e) =>
              setFilterPriority(e.target.value as TaskPriority | "")
            }
            className="bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-1.5 text-xs text-zinc-400 focus:outline-none focus:border-teal-500/50"
          >
            <option value="">All Priority</option>
            <option value="urgent">Urgent</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>

          <button
            onClick={() => {
              setCreateDefaultStatus("todo");
              setShowCreateModal(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 hover:bg-teal-500 text-white text-sm rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Task
          </button>
        </div>
      </div>

      {/* Board view */}
      {view === "board" && (
        <div className="grid grid-cols-4 gap-4">
          {STATUS_COLUMNS.map((col) => (
            <div key={col.key} className="space-y-3">
              {/* Column header */}
              <div
                className={`flex items-center justify-between pb-2 border-b-2 ${col.color}`}
              >
                <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">
                  {col.label}
                </span>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-zinc-600 bg-white/[0.05] rounded px-1.5 py-0.5">
                    {tasksByStatus[col.key]?.length ?? 0}
                  </span>
                  <button
                    onClick={() => {
                      setCreateDefaultStatus(col.key);
                      setShowCreateModal(true);
                    }}
                    className="text-zinc-600 hover:text-zinc-300 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Cards */}
              <div className="space-y-2 min-h-[4rem]">
                {tasksByStatus[col.key]?.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onUpdate={handleUpdate}
                    onDelete={handleDelete}
                  />
                ))}
                {tasksByStatus[col.key]?.length === 0 && (
                  <div className="text-center py-6 text-zinc-700 text-xs">
                    No tasks
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* List view */}
      {view === "list" && (
        <div className="bg-[#1e1b2e] border border-white/[0.08] rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">
                  Title
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide w-32">
                  Status
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide w-28">
                  Priority
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide w-32">
                  Assignee
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide w-28">
                  Due
                </th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-zinc-600">
                    No tasks found
                  </td>
                </tr>
              ) : (
                filtered.map((task) => {
                  const isOverdue =
                    task.due_date &&
                    task.status !== "done" &&
                    new Date(task.due_date) < new Date();
                  return (
                    <tr key={task.id} className="hover:bg-white/[0.02] group">
                      <td className="px-4 py-3">
                        <span
                          className={
                            task.status === "done"
                              ? "line-through text-zinc-500"
                              : "text-zinc-200"
                          }
                        >
                          {task.title}
                        </span>
                        {task.description && (
                          <p className="text-xs text-zinc-600 truncate max-w-xs mt-0.5">
                            {task.description}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={task.status}
                          onChange={(e) =>
                            handleUpdate(task.id, {
                              status: e.target.value as TaskStatus,
                            })
                          }
                          className={`bg-transparent text-xs focus:outline-none cursor-pointer ${
                            task.status === "done"
                              ? "text-emerald-400"
                              : task.status === "blocked"
                                ? "text-rose-400"
                                : task.status === "in_progress"
                                  ? "text-blue-400"
                                  : "text-zinc-400"
                          }`}
                        >
                          <option value="todo">To Do</option>
                          <option value="in_progress">In Progress</option>
                          <option value="blocked">Blocked</option>
                          <option value="done">Done</option>
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-xs ${PRIORITY_COLORS[task.priority]}`}
                        >
                          {PRIORITY_LABELS[task.priority]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-zinc-500">
                        {task.assignee?.display_name ?? "—"}
                      </td>
                      <td
                        className={`px-4 py-3 text-xs ${isOverdue ? "text-rose-400" : "text-zinc-500"}`}
                      >
                        {task.due_date
                          ? new Date(task.due_date).toLocaleDateString(
                              "en-US",
                              { month: "short", day: "numeric" },
                            )
                          : "—"}
                      </td>
                      <td className="px-2">
                        <button
                          onClick={() => handleDelete(task.id)}
                          className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-rose-400 transition-all"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Create modal */}
      {showCreateModal && projectId && (
        <CreateTaskModal
          projectId={projectId}
          defaultStatus={createDefaultStatus}
          onCreated={handleCreated}
          onClose={() => setShowCreateModal(false)}
        />
      )}
    </div>
  );
}
