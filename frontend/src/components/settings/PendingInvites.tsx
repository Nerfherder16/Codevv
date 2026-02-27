import React, { useState, useEffect, useCallback } from "react";
import { Clock, X, Mail } from "lucide-react";
import { api } from "../../lib/api";
import { useToast } from "../../contexts/ToastContext";
import type { ProjectInvite } from "../../types";
import { Card } from "../common/Card";

interface Props {
  projectId: string;
  refreshKey?: number;
}

export function PendingInvites({ projectId, refreshKey }: Props) {
  const { toast } = useToast();
  const [invites, setInvites] = useState<ProjectInvite[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchInvites = useCallback(async () => {
    try {
      const data = await api.get<ProjectInvite[]>(
        `/projects/${projectId}/invites`,
      );
      setInvites(data.filter((i) => i.status === "pending"));
    } catch {
      // Silently fail -- user might not be owner
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchInvites();
  }, [fetchInvites, refreshKey]);

  const handleRevoke = useCallback(
    async (inviteId: string) => {
      try {
        await api.delete(`/invites/${inviteId}`);
        setInvites((prev) => prev.filter((i) => i.id !== inviteId));
        toast("Invite revoked", "success");
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to revoke invite";
        toast(message, "error");
      }
    },
    [toast],
  );

  if (loading || invites.length === 0) return null;

  return (
    <section className="mb-8">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
        <Mail className="w-5 h-5" />
        Pending Invites
        <span className="text-sm font-normal text-gray-500 dark:text-gray-400">
          ({invites.length})
        </span>
      </h2>

      <div className="space-y-2">
        {invites.map((inv) => (
          <Card key={inv.id} className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-full bg-amber-500/10 shrink-0">
              <Mail className="w-4 h-4 text-amber-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                {inv.email}
              </p>
              <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                <span className="capitalize">{inv.role}</span>
                <span>&middot;</span>
                <Clock className="w-3 h-3" />
                <span>
                  Expires {new Date(inv.expires_at).toLocaleDateString()}
                </span>
              </div>
            </div>
            <button
              onClick={() => handleRevoke(inv.id)}
              className="rounded-lg p-1.5 text-gray-400 transition-all hover:bg-red-500/10 hover:text-red-400"
              title="Revoke invite"
            >
              <X className="w-4 h-4" />
            </button>
          </Card>
        ))}
      </div>
    </section>
  );
}
