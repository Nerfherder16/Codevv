import React, { useState, useCallback } from "react";
import { Users, UserPlus } from "lucide-react";
import { api } from "../../lib/api";
import { useToast } from "../../contexts/ToastContext";
import type { ProjectMember, ProjectRole } from "../../types";
import { ROLE_COLORS } from "../../lib/constants";
import { Button } from "../common/Button";
import { Card } from "../common/Card";
import { Modal } from "../common/Modal";
import { Input, Select } from "../common/Input";

const ROLES: ProjectRole[] = ["owner", "editor", "viewer"];

interface Props {
  projectId: string;
  members: ProjectMember[];
  onInviteSent?: () => void;
}

export function MembersSection({ projectId, members, onInviteSent }: Props) {
  const { toast } = useToast();
  const [showModal, setShowModal] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<ProjectRole>("editor");
  const [sending, setSending] = useState(false);

  const handleInvite = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!email.trim()) {
        toast("Email is required.", "error");
        return;
      }
      setSending(true);
      try {
        await api.post(`/projects/${projectId}/invites`, {
          email: email.trim(),
          role,
        });
        toast("Invite sent!", "success");
        setEmail("");
        setRole("editor");
        setShowModal(false);
        onInviteSent?.();
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to send invite";
        toast(message, "error");
      } finally {
        setSending(false);
      }
    },
    [projectId, email, role, toast, onInviteSent],
  );

  return (
    <>
      <section className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Users className="w-5 h-5" />
            Members
            <span className="text-sm font-normal text-gray-500 dark:text-gray-400">
              ({members.length})
            </span>
          </h2>
          <Button size="sm" onClick={() => setShowModal(true)}>
            <UserPlus className="w-4 h-4" />
            Invite Member
          </Button>
        </div>

        <div className="space-y-2">
          {members.map((member) => (
            <Card key={member.id} className="flex items-center gap-3">
              <div className="flex items-center justify-center w-9 h-9 rounded-full bg-gradient-to-br from-teal to-coral text-white text-sm font-semibold shrink-0">
                {member.display_name
                  .split(" ")
                  .map((w) => w[0])
                  .join("")
                  .toUpperCase()
                  .slice(0, 2)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                  {member.display_name}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                  {member.email}
                </p>
              </div>
              <span
                className={`text-xs font-medium px-2 py-0.5 rounded-full ${ROLE_COLORS[member.role] || ROLE_COLORS.viewer}`}
              >
                {member.role}
              </span>
            </Card>
          ))}
        </div>
      </section>

      {/* Invite Member Modal */}
      <Modal
        open={showModal}
        onClose={() => {
          setShowModal(false);
          setEmail("");
          setRole("editor");
        }}
        title="Invite Member"
      >
        <form onSubmit={handleInvite} className="space-y-4">
          <div>
            <label
              htmlFor="inviteEmail"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Email <span className="text-red-500">*</span>
            </label>
            <Input
              id="inviteEmail"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
              autoFocus
            />
          </div>
          <div>
            <label
              htmlFor="inviteRole"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Role
            </label>
            <Select
              id="inviteRole"
              value={role}
              onChange={(e) => setRole(e.target.value as ProjectRole)}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r.charAt(0).toUpperCase() + r.slice(1)}
                </option>
              ))}
            </Select>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              <span className="font-medium">Owner:</span> full access |{" "}
              <span className="font-medium">Editor:</span> read/write |{" "}
              <span className="font-medium">Viewer:</span> read only
            </p>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setShowModal(false)}
            >
              Cancel
            </Button>
            <Button type="submit" loading={sending}>
              <UserPlus className="w-4 h-4" />
              Send Invite
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
