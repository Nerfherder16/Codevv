import React, { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  FolderPlus,
  Zap,
  ArrowRight,
  Loader2,
  SkipForward,
} from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";

const INPUT_CLASS =
  "w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 py-3 text-sm text-gray-100 placeholder-gray-500 outline-none transition-all focus:border-[#00AFB9]/50 focus:ring-2 focus:ring-[#00AFB9]/20";

const STEPS = [
  { icon: Sparkles, label: "Welcome" },
  { icon: FolderPlus, label: "First Project" },
  { icon: Zap, label: "Ready" },
];

export function OnboardingPage() {
  const navigate = useNavigate();
  const { user, updateProfile } = useAuth();
  const { toast } = useToast();

  const [step, setStep] = useState(0);
  const [projectName, setProjectName] = useState("");
  const [projectDesc, setProjectDesc] = useState("");
  const [loading, setLoading] = useState(false);
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null);

  const createProject = useCallback(async () => {
    if (!projectName.trim()) {
      toast("Project name is required", "error");
      return;
    }
    setLoading(true);
    try {
      const project = await api.post<{ id: string }>("/projects", {
        name: projectName.trim(),
        description: projectDesc.trim() || null,
      });
      setCreatedProjectId(project.id);
      setStep(2);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to create project";
      toast(message, "error");
    } finally {
      setLoading(false);
    }
  }, [projectName, projectDesc, toast]);

  const completeOnboarding = useCallback(async () => {
    setLoading(true);
    try {
      await updateProfile({ onboarding_completed: true });
      navigate(
        createdProjectId ? `/projects/${createdProjectId}` : "/projects",
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to complete onboarding";
      toast(message, "error");
    } finally {
      setLoading(false);
    }
  }, [updateProfile, navigate, createdProjectId, toast]);

  const skipProject = useCallback(() => {
    setStep(2);
  }, []);

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0f0d1a]">
      {/* Gradient orbs */}
      <div className="pointer-events-none absolute -left-32 top-1/4 h-96 w-96 rounded-full bg-[#00AFB9]/8 blur-[120px]" />
      <div className="pointer-events-none absolute -right-32 bottom-1/4 h-96 w-96 rounded-full bg-[#8b5cf6]/8 blur-[120px]" />

      <div className="w-full max-w-lg px-4">
        {/* Step indicators */}
        <div className="mb-8 flex items-center justify-center gap-2">
          {STEPS.map((s, i) => (
            <div key={s.label} className="flex items-center gap-2">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium transition-all ${
                  i <= step
                    ? "bg-[#00AFB9]/20 text-[#00AFB9]"
                    : "bg-white/[0.03] text-gray-500"
                }`}
              >
                <s.icon className="h-4 w-4" />
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={`h-px w-12 transition-all ${i < step ? "bg-[#00AFB9]/40" : "bg-white/[0.06]"}`}
                />
              )}
            </div>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {step === 0 && (
            <motion.div
              key="welcome"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-8 text-center backdrop-blur-xl"
            >
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#00AFB9]/10">
                <Sparkles className="h-8 w-8 text-[#00AFB9]" />
              </div>
              <h1 className="text-2xl font-semibold text-gray-100">
                Welcome to Codevv{user ? `, ${user.display_name}` : ""}!
              </h1>
              <p className="mt-2 text-sm text-gray-400">
                Let's get you set up. This will only take a moment.
              </p>
              <button
                onClick={() => setStep(1)}
                className="mt-8 inline-flex items-center gap-2 rounded-lg bg-[#00AFB9] px-6 py-3 text-sm font-medium text-[#0f0d1a] transition-all hover:brightness-110"
              >
                Get Started <ArrowRight className="h-4 w-4" />
              </button>
            </motion.div>
          )}

          {step === 1 && (
            <motion.div
              key="project"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-8 backdrop-blur-xl"
            >
              <div className="mb-6 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#00AFB9]/10">
                  <FolderPlus className="h-6 w-6 text-[#00AFB9]" />
                </div>
                <h2 className="text-xl font-semibold text-gray-100">
                  Create your first project
                </h2>
                <p className="mt-1 text-sm text-gray-400">
                  Projects are where your team collaborates.
                </p>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400">
                    Project Name
                  </label>
                  <input
                    type="text"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    placeholder="My Awesome Project"
                    className={INPUT_CLASS}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400">
                    Description (optional)
                  </label>
                  <textarea
                    value={projectDesc}
                    onChange={(e) => setProjectDesc(e.target.value)}
                    placeholder="What's this project about?"
                    rows={3}
                    className={INPUT_CLASS + " resize-none"}
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={skipProject}
                    className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-white/[0.06] px-4 py-3 text-sm font-medium text-gray-400 transition-all hover:bg-white/[0.03] hover:text-gray-200"
                  >
                    <SkipForward className="h-4 w-4" /> Skip
                  </button>
                  <button
                    onClick={createProject}
                    disabled={loading || !projectName.trim()}
                    className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#00AFB9] px-4 py-3 text-sm font-medium text-[#0f0d1a] transition-all hover:brightness-110 disabled:opacity-50"
                  >
                    {loading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ArrowRight className="h-4 w-4" />
                    )}
                    Create Project
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div
              key="ready"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-8 text-center backdrop-blur-xl"
            >
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#00AFB9]/10">
                <Zap className="h-8 w-8 text-[#00AFB9]" />
              </div>
              <h2 className="text-2xl font-semibold text-gray-100">
                You're all set!
              </h2>
              <p className="mt-2 text-sm text-gray-400">
                {createdProjectId
                  ? "Your project is ready. Time to build something amazing."
                  : "You can create projects anytime from the dashboard."}
              </p>
              <button
                onClick={completeOnboarding}
                disabled={loading}
                className="mt-8 inline-flex items-center gap-2 rounded-lg bg-[#00AFB9] px-6 py-3 text-sm font-medium text-[#0f0d1a] transition-all hover:brightness-110 disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ArrowRight className="h-4 w-4" />
                )}
                Go to Dashboard
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
