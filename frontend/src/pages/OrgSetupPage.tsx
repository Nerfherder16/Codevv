import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Building2,
  ArrowRight,
  UserPlus,
  Check,
  Loader2,
  X,
} from "lucide-react";
import { api } from "../lib/api";
import type { Organization } from "../types";
import { useAuth } from "../contexts/AuthContext";

type Step = "create" | "invite" | "done";

export function OrgSetupPage() {
  const navigate = useNavigate();
  const { fetchUserOrgs, setCurrentOrg } = useAuth();

  const [step, setStep] = useState<Step>("create");
  const [org, setOrg] = useState<Organization | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [invites, setInvites] = useState<{ email: string; role: string }[]>([]);
  const [inviting, setInviting] = useState(false);
  const [inviteSent, setInviteSent] = useState<string[]>([]);

  const autoSlug = (n: string) =>
    n
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

  const handleNameChange = (v: string) => {
    setName(v);
    if (!slugEdited) setSlug(autoSlug(v));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !slug.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      const created = await api.orgs.create({
        name: name.trim(),
        slug: slug.trim(),
      });
      setOrg(created);
      await fetchUserOrgs();
      setCurrentOrg(created);
      setStep("invite");
    } catch (err) {
      setCreateError(
        err instanceof Error ? err.message : "Failed to create organization",
      );
    } finally {
      setCreating(false);
    }
  };

  const handleAddInvite = () => {
    if (!inviteEmail.trim()) return;
    setInvites((prev) => [
      ...prev,
      { email: inviteEmail.trim(), role: inviteRole },
    ]);
    setInviteEmail("");
  };

  const handleSendInvites = async () => {
    if (!org) return;
    setInviting(true);
    for (const inv of invites.filter((i) => !inviteSent.includes(i.email))) {
      try {
        await api.orgs.invite(org.id, {
          email: inv.email,
          role: inv.role,
          persona: "creator",
        });
        setInviteSent((prev) => [...prev, inv.email]);
      } catch {
        // continue
      }
    }
    setInviting(false);
    setStep("done");
  };

  const stepIdx = { create: 0, invite: 1, done: 2 };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0f0d1a] flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="flex justify-center mb-8">
          <img src="/codevvrevlogo.png" alt="Codevv" className="h-10 w-auto" />
        </div>

        <div className="flex items-center justify-center gap-2 mb-8">
          {(["create", "invite", "done"] as Step[]).map((s, i) => (
            <React.Fragment key={s}>
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                  stepIdx[step] >= i
                    ? "bg-cyan-500 text-white"
                    : "bg-gray-200 dark:bg-white/[0.06] text-gray-400"
                }`}
              >
                {i + 1}
              </div>
              {i < 2 && (
                <div className="w-12 h-px bg-gray-200 dark:bg-white/[0.08]" />
              )}
            </React.Fragment>
          ))}
        </div>

        <div className="rounded-2xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.03] p-8 shadow-xl">
          {step === "create" && (
            <>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center">
                  <Building2 className="w-5 h-5 text-cyan-400" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    Create your organization
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Your team's workspace on Codevv
                  </p>
                </div>
              </div>

              <form onSubmit={handleCreate} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Organization name
                  </label>
                  <input
                    value={name}
                    onChange={(e) => handleNameChange(e.target.value)}
                    placeholder="Acme Corp"
                    autoFocus
                    className="w-full rounded-lg border border-gray-300 dark:border-white/[0.10] bg-white dark:bg-white/[0.05] px-3 py-2.5 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    URL slug
                  </label>
                  <input
                    value={slug}
                    onChange={(e) => {
                      setSlug(autoSlug(e.target.value));
                      setSlugEdited(true);
                    }}
                    placeholder="acme-corp"
                    className="w-full rounded-lg border border-gray-300 dark:border-white/[0.10] bg-white dark:bg-white/[0.05] px-3 py-2.5 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:border-cyan-500 focus:outline-none"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Lowercase letters, numbers, and hyphens only
                  </p>
                </div>
                {createError && (
                  <p className="text-sm text-red-500">{createError}</p>
                )}
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => navigate("/projects")}
                    className="flex-1 py-2.5 rounded-lg border border-gray-200 dark:border-white/[0.10] text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/[0.05] transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={creating || !name.trim() || !slug.trim()}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-white text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    {creating ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <ArrowRight className="w-4 h-4" />
                    )}
                    {creating ? "Creating..." : "Create"}
                  </button>
                </div>
              </form>
            </>
          )}

          {step === "invite" && org && (
            <>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center">
                  <UserPlus className="w-5 h-5 text-violet-400" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    Invite teammates
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Add people to <strong>{org.name}</strong>
                  </p>
                </div>
              </div>

              <div className="space-y-3 mb-6">
                <div className="flex gap-2">
                  <input
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    onKeyDown={(e) =>
                      e.key === "Enter" &&
                      (e.preventDefault(), handleAddInvite())
                    }
                    placeholder="teammate@company.com"
                    type="email"
                    className="flex-1 rounded-lg border border-gray-300 dark:border-white/[0.10] bg-white dark:bg-white/[0.05] px-3 py-2.5 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:border-cyan-500 focus:outline-none"
                  />
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value)}
                    className="rounded-lg border border-gray-300 dark:border-white/[0.10] bg-white dark:bg-white/[0.05] px-3 py-2.5 text-sm text-gray-900 dark:text-gray-100 focus:outline-none"
                  >
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                  </select>
                  <button
                    onClick={handleAddInvite}
                    disabled={!inviteEmail.trim()}
                    className="px-3 rounded-lg bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 transition-colors disabled:opacity-40"
                  >
                    Add
                  </button>
                </div>
                {invites.map((inv) => (
                  <div
                    key={inv.email}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 dark:bg-white/[0.03] border border-gray-100 dark:border-white/[0.05]"
                  >
                    {inviteSent.includes(inv.email) ? (
                      <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : (
                      <div className="w-4 h-4 rounded-full bg-gray-300 dark:bg-white/[0.12] shrink-0" />
                    )}
                    <span className="flex-1 text-sm text-gray-700 dark:text-gray-300 truncate">
                      {inv.email}
                    </span>
                    <span className="text-xs capitalize text-gray-400">
                      {inv.role}
                    </span>
                    {!inviteSent.includes(inv.email) && (
                      <button
                        onClick={() =>
                          setInvites((p) =>
                            p.filter((i) => i.email !== inv.email),
                          )
                        }
                      >
                        <X className="w-3.5 h-3.5 text-gray-400 hover:text-red-400" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep("done")}
                  className="flex-1 py-2.5 rounded-lg border border-gray-200 dark:border-white/[0.10] text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/[0.05] transition-colors"
                >
                  Skip for now
                </button>
                <button
                  onClick={
                    invites.length > 0
                      ? handleSendInvites
                      : () => setStep("done")
                  }
                  disabled={inviting}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-white text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {inviting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <ArrowRight className="w-4 h-4" />
                  )}
                  {inviting
                    ? "Sending..."
                    : invites.length > 0
                      ? "Send Invites"
                      : "Continue"}
                </button>
              </div>
            </>
          )}

          {step === "done" && org && (
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
                <Check className="w-8 h-8 text-emerald-400" />
              </div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                Organization created!
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
                <strong>{org.name}</strong> is ready. Start by creating a
                project.
              </p>
              <button
                onClick={() => navigate("/projects")}
                className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-white text-sm font-medium transition-colors"
              >
                Go to Projects <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
