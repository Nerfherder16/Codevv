import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  User as UserIcon,
  Lock,
  Mail,
  Calendar,
  Building2,
  Save,
  Shield,
  Check,
} from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { Button } from "../components/common/Button";
import { Card } from "../components/common/Card";
import { Input } from "../components/common/Input";

export function ProfilePage() {
  const navigate = useNavigate();
  const { user, updateProfile, userOrgs } = useAuth();
  const { toast } = useToast();

  // Display name form
  const [displayName, setDisplayName] = useState(user?.display_name || "");
  const [savingName, setSavingName] = useState(false);

  // Password form
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  const handleSaveName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) {
      toast("Display name is required.", "error");
      return;
    }
    setSavingName(true);
    try {
      await updateProfile({ display_name: displayName.trim() });
      toast("Display name updated!", "success");
    } catch (err) {
      toast(
        err instanceof Error ? err.message : "Failed to update profile",
        "error",
      );
    } finally {
      setSavingName(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword || !newPassword) {
      toast("All password fields are required.", "error");
      return;
    }
    if (newPassword.length < 6) {
      toast("New password must be at least 6 characters.", "error");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast("New passwords do not match.", "error");
      return;
    }
    setSavingPassword(true);
    try {
      await api.post("/auth/change-password", {
        current_password: currentPassword,
        new_password: newPassword,
      });
      toast("Password changed successfully!", "success");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      toast(
        err instanceof Error ? err.message : "Failed to change password",
        "error",
      );
    } finally {
      setSavingPassword(false);
    }
  };

  if (!user) return null;

  const memberSince = new Date(user.created_at).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <header className="sticky top-0 z-50 border-b border-gray-200/80 dark:border-white/[0.04] bg-white/80 dark:bg-gray-950/80 backdrop-blur-xl">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 h-16 flex items-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/projects")}
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>
          <h1 className="ml-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
            Profile & Settings
          </h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        {/* Account overview */}
        <section>
          <div className="flex items-center gap-4 mb-6">
            <div className="w-16 h-16 rounded-2xl bg-cyan-500 text-white flex items-center justify-center text-2xl font-bold shadow-lg shadow-cyan-500/20">
              {user.display_name?.charAt(0)?.toUpperCase() || "U"}
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                {user.display_name}
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {user.email}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Card className="flex items-center gap-3">
              <Mail className="w-4 h-4 text-cyan-400 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  Email
                </p>
                <p className="text-sm text-gray-900 dark:text-gray-100 truncate">
                  {user.email}
                </p>
              </div>
            </Card>
            <Card className="flex items-center gap-3">
              <Calendar className="w-4 h-4 text-violet-400 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  Member since
                </p>
                <p className="text-sm text-gray-900 dark:text-gray-100">
                  {memberSince}
                </p>
              </div>
            </Card>
            <Card className="flex items-center gap-3">
              <Building2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  Organizations
                </p>
                <p className="text-sm text-gray-900 dark:text-gray-100">
                  {userOrgs.length}
                </p>
              </div>
            </Card>
          </div>
        </section>

        {/* Display name */}
        <section>
          <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-gray-400 dark:text-gray-500 mb-3 flex items-center gap-2">
            <UserIcon className="w-4 h-4" />
            Display Name
          </h3>
          <Card>
            <form onSubmit={handleSaveName} className="space-y-3">
              <Input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name"
              />
              <div className="flex justify-end">
                <Button
                  type="submit"
                  size="sm"
                  loading={savingName}
                  disabled={displayName.trim() === user.display_name}
                >
                  <Save className="w-3.5 h-3.5" />
                  Save
                </Button>
              </div>
            </form>
          </Card>
        </section>

        {/* Change password */}
        <section>
          <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-gray-400 dark:text-gray-500 mb-3 flex items-center gap-2">
            <Lock className="w-4 h-4" />
            Change Password
          </h3>
          <Card>
            <form onSubmit={handleChangePassword} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Current Password
                </label>
                <Input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter current password"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  New Password
                </label>
                <Input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Min 6 characters"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Confirm New Password
                </label>
                <Input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                  error={
                    confirmPassword.length > 0 &&
                    confirmPassword !== newPassword
                  }
                />
              </div>
              <div className="flex justify-end">
                <Button
                  type="submit"
                  size="sm"
                  loading={savingPassword}
                  disabled={!currentPassword || !newPassword || !confirmPassword}
                >
                  <Shield className="w-3.5 h-3.5" />
                  Change Password
                </Button>
              </div>
            </form>
          </Card>
        </section>

        {/* Organizations */}
        <section>
          <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-gray-400 dark:text-gray-500 mb-3 flex items-center gap-2">
            <Building2 className="w-4 h-4" />
            Your Organizations
          </h3>
          {userOrgs.length === 0 ? (
            <Card>
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                You're not a member of any organizations yet.
              </p>
            </Card>
          ) : (
            <div className="space-y-2">
              {userOrgs.map((org) => (
                <Card key={org.id} className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-cyan-500/10 flex items-center justify-center shrink-0">
                    <Building2 className="w-4 h-4 text-cyan-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                      {org.name}
                    </p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      {org.slug}
                    </p>
                  </div>
                  {org.owner_id === user.id && (
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-500">
                      Owner
                    </span>
                  )}
                </Card>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
