"use client";

import React, { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  GraduationCap,
  Upload,
  Sparkles,
  FileText,
  ArrowLeft,
  X,
  Plus,
  FileCheck2,
  Trash2,
  Image as ImageIcon,
  Loader2,
  CheckCircle2,
  Cpu,
  ShieldCheck,
  Clock,
} from "lucide-react";
import { api } from "@/lib/api";
import {
  ButtonPrimary,
  ButtonUtility,
  FeatureCard,
  BadgePill,
} from "@/components/ui";
import { useToast, queueToast } from "@/lib/ToastContext";
import { useTenant } from "@/lib/TenantContext";

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const AGENTIC_RUBRIC_STEPS = [
  {
    title: "Document Ingestion & Normalization",
    desc: "Converting multimodal pages into high-fidelity vectorized evaluation surfaces",
  },
  {
    title: "Question & Choice Structure Extraction",
    desc: "Dissecting question hierarchy, sub-parts, mathematical equations, and mark weights",
  },
  {
    title: "Model Solution & Criteria Formulation",
    desc: "Establishing step-by-step marking rubrics, acceptable alternatives, and tolerances",
  },
  {
    title: "Synthesizing Interactive Review Workspace",
    desc: "Assembling approved rubric structure ready for Root Admin verification",
  },
];

export default function NewExamPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { selectedBranch, isRootAdmin, isBranchManager } = useTenant();
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [extraNotes, setExtraNotes] = useState("");
  const [qpFiles, setQpFiles] = useState<File[]>([]);
  const [akFiles, setAkFiles] = useState<File[]>([]);
  const [isQpDragging, setIsQpDragging] = useState(false);
  const [isAkDragging, setIsAkDragging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [currentStep, setCurrentStep] = useState(0);

  const qpInputRef = useRef<HTMLInputElement>(null);
  const akInputRef = useRef<HTMLInputElement>(null);

  // Rubric synthesis is strictly active only when Root Admin provides both Question Paper and Answer Key
  const isSynthesizingRubric = isRootAdmin && qpFiles.length > 0 && akFiles.length > 0;

  // Ensure answer key files are purged if the user is not Root Admin
  useEffect(() => {
    if (!isRootAdmin && akFiles.length > 0) {
      setAkFiles([]);
    }
  }, [isRootAdmin, akFiles]);

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (isSubmitting && isSynthesizingRubric) {
      setElapsedSeconds(0);
      setCurrentStep(0);
      const start = Date.now();
      interval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - start) / 1000);
        setElapsedSeconds(elapsed);
        if (elapsed < 3) {
          setCurrentStep(0);
        } else if (elapsed < 9) {
          setCurrentStep(1);
        } else if (elapsed < 16) {
          setCurrentStep(2);
        } else {
          setCurrentStep(3);
        }
      }, 500);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isSubmitting, isSynthesizingRubric]);

  const handleQpChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isSubmitting) return;
    if (e.target.files && e.target.files.length > 0) {
      const added = Array.from(e.target.files);
      setQpFiles((prev) => [...prev, ...added]);
    }
    e.target.value = "";
  };

  const handleQpDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsQpDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const added = Array.from(e.dataTransfer.files);
      setQpFiles((prev) => [...prev, ...added]);
    }
  };

  const handleRemoveQpFile = (index: number) => {
    if (isSubmitting) return;
    setQpFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAkChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isSubmitting) return;
    if (e.target.files && e.target.files.length > 0) {
      const added = Array.from(e.target.files);
      setAkFiles((prev) => [...prev, ...added]);
    }
    e.target.value = "";
  };

  const handleAkDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsAkDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const added = Array.from(e.dataTransfer.files);
      setAkFiles((prev) => [...prev, ...added]);
    }
  };

  const handleRemoveAkFile = (index: number) => {
    if (isSubmitting) return;
    setAkFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!title.trim() || !subject.trim()) {
      toast.warning("Please provide Exam Title and Subject.", { title: "Missing Information" });
      return;
    }

    const shouldGenerateRubric = isRootAdmin && qpFiles.length > 0 && akFiles.length > 0;
    setIsSubmitting(true);

    try {
      const formData = new FormData();
      formData.append("title", title.trim());
      formData.append("subject", subject.trim());
      if (selectedBranch?.id) {
        formData.append("branch_id", selectedBranch.id);
      }
      if (extraNotes.trim()) formData.append("extra_notes", extraNotes.trim());

      // Append all Question Paper files if present
      for (const file of qpFiles) {
        formData.append("question_paper", file);
      }

      const createdExam = await api.createExam(formData);

      // Answer key upload is strictly Root Admin only
      if (isRootAdmin && akFiles.length > 0) {
        const akFormData = new FormData();
        for (const file of akFiles) {
          akFormData.append("answer_key", file);
        }
        await api.uploadAnswerKey(createdExam.id, akFormData);
      }

      if (shouldGenerateRubric) {
        queueToast({
          type: "success",
          title: "Exam Created & Rubric Generated",
          message: `Exam "${title.trim()}" created with AI rubric draft ready for review.`,
        });
        router.push(`/exams/${createdExam.id}/rubric`);
      } else {
        queueToast({
          type: "success",
          title: "Exam Created",
          message: `Exam "${title.trim()}" created successfully! You can now open student submission windows.`,
        });
        router.push(`/exams/${createdExam.id}`);
      }
    } catch (err: any) {
      const msg = err.message || "Failed to create exam";
      toast.error(msg, { title: "Exam Creation Failed" });
      setIsSubmitting(false);
    }
  };

  const progressPercent = Math.min(
    95,
    Math.max(
      12,
      currentStep === 0
        ? 15 + elapsedSeconds * 5
        : currentStep === 1
        ? 35 + (elapsedSeconds - 3) * 4
        : currentStep === 2
        ? 65 + (elapsedSeconds - 10) * 3
        : 85 + (elapsedSeconds - 18) * 1.5
    )
  );

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-12">
      {/* Top Breadcrumbs */}
      <div className="flex items-center justify-between pb-2 border-b border-hairline">
        <ButtonUtility
          href="/exams"
          className={`self-start ${isSubmitting ? "pointer-events-none opacity-50" : ""}`}
        >
          <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
          Back to Examinations
        </ButtonUtility>
      </div>

      <div className="relative">
        {/* Differentiated Processing Overlays */}
        {isSubmitting && (
          isSynthesizingRubric ? (
            /* Root Admin with Question Paper & Answer Key: Agentic Rubric Synthesis */
            <div className="absolute inset-0 z-30 rounded-xl bg-surface/96 backdrop-blur-xl flex flex-col items-center justify-center p-6 sm:p-8 text-center animate-in fade-in duration-300 border border-hairline shadow-2xl">
              {/* Bespoke Agentic Core */}
              <div className="relative mb-4 flex items-center justify-center">
                <div className="absolute h-20 w-20 rounded-full bg-indigo-500/10 animate-ping opacity-30" />
                <div className="absolute h-16 w-16 rounded-full border border-indigo-400/25 animate-pulse" />
                <div className="relative h-14 w-14 rounded-2xl bg-gradient-to-tr from-indigo-50 via-surface to-sky-50 border border-indigo-200/60 dark:bg-slate-900 dark:border-indigo-500/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shadow-sm">
                  <Cpu className="h-7 w-7 animate-pulse" />
                </div>
              </div>

              {/* Agentic Live Badge (No cartoon logos) */}
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 text-xs font-semibold tracking-wide">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-600"></span>
                </span>
                Autonomous Rubric Agent Active
              </div>

              <h2 className="text-xl sm:text-2xl font-bold text-ink tracking-tight mt-3">
                Synthesizing Structured Exam Rubric
              </h2>
              <p className="mt-1 text-xs sm:text-sm text-ink-muted max-w-lg leading-relaxed">
                Dissecting question paper layout, validating marking constraints, and formulating step-by-step evaluation criteria.
              </p>

              {/* Document Summary Chips */}
              <div className="flex flex-wrap items-center justify-center gap-2 mt-4 text-xs">
                <div className="rounded-lg bg-canvas-soft border border-hairline px-3 py-1.5 text-ink flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5 text-primary" />
                  <span>
                    Question Paper: <strong>{qpFiles.length} {qpFiles.length === 1 ? "file" : "files"}</strong>
                  </span>
                </div>
                <div className="rounded-lg bg-canvas-soft border border-hairline px-3 py-1.5 text-ink flex items-center gap-1.5">
                  <FileCheck2 className="h-3.5 w-3.5 text-emerald-600" />
                  <span>
                    Answer Key: <strong>{akFiles.length} {akFiles.length === 1 ? "file" : "files"}</strong>
                  </span>
                </div>
                <div className="rounded-lg bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 px-3 py-1.5 text-indigo-700 dark:text-indigo-300 font-mono font-medium flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 animate-spin" />
                  <span>{elapsedSeconds}s elapsed</span>
                </div>
              </div>

              {/* Agentic Timeline Feed */}
              <div className="w-full max-w-lg mt-5 bg-canvas-soft/80 border border-hairline rounded-xl p-4 text-left space-y-2.5">
                {AGENTIC_RUBRIC_STEPS.map((step, idx) => {
                  const isCompleted = idx < currentStep;
                  const isCurrent = idx === currentStep;
                  return (
                    <div
                      key={idx}
                      className={`flex items-start gap-3 transition-all duration-300 ${
                        isCompleted
                          ? "opacity-90"
                          : isCurrent
                          ? "opacity-100"
                          : "opacity-35"
                      }`}
                    >
                      <div className="mt-0.5 shrink-0">
                        {isCompleted ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        ) : isCurrent ? (
                          <Loader2 className="h-4 w-4 text-indigo-600 animate-spin" />
                        ) : (
                          <div className="h-4 w-4 rounded-full border border-hairline bg-surface flex items-center justify-center text-[10px] text-ink-muted font-mono">
                            {idx + 1}
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span
                            className={`text-xs ${
                              isCurrent
                                ? "text-indigo-600 dark:text-indigo-400 font-bold"
                                : isCompleted
                                ? "text-ink font-semibold"
                                : "text-ink-muted"
                            }`}
                          >
                            {step.title}
                          </span>
                          {isCurrent && (
                            <span className="text-[10px] font-semibold text-indigo-600 bg-indigo-50 dark:bg-indigo-950/60 px-2 py-0.5 rounded-full border border-indigo-200">
                              In Progress
                            </span>
                          )}
                          {isCompleted && (
                            <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-200">
                              Completed
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-ink-muted mt-0.5 leading-tight">
                          {step.desc}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Animated Gradient Progress Bar */}
              <div className="w-full max-w-lg mt-4 space-y-1.5">
                <div className="h-2 w-full bg-canvas-soft border border-hairline rounded-full overflow-hidden relative">
                  <div
                    className="h-full bg-gradient-to-r from-indigo-500 via-primary to-indigo-600 rounded-full transition-all duration-300 ease-out"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] text-ink-muted px-1 font-mono">
                  <span>Synthesizing rubric criteria...</span>
                  <span>Autonomous Pipeline</span>
                </div>
              </div>

              {/* Security footnote */}
              <div className="flex items-center gap-1.5 text-xs text-ink-muted mt-4">
                <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>Draft rubric will be opened in the interactive editor for review and approval.</span>
              </div>
            </div>
          ) : (
            /* Fast, Clean Minimalist Loader for Branch Manager & No-Rubric Creation */
            <div className="absolute inset-0 z-30 rounded-xl bg-surface/90 backdrop-blur-md flex flex-col items-center justify-center p-6 sm:p-8 text-center animate-in fade-in duration-200 border border-hairline shadow-notion-modal">
              <div className="relative mb-4 flex items-center justify-center">
                <div className="absolute h-16 w-16 rounded-full bg-primary/10 animate-ping opacity-50" />
                <div className="h-12 w-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-xs relative">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              </div>

              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface border border-hairline text-ink-muted text-[11px] font-medium mb-2">
                <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                Academic Operations
              </div>

              <h2 className="text-lg sm:text-xl font-bold text-ink tracking-tight">
                Creating Examination...
              </h2>
              <p className="mt-1 text-xs text-ink-muted max-w-sm leading-relaxed">
                Registering examination record, linking branch settings, and initializing workspace.
              </p>
            </div>
          )
        )}

        {/* Main Card */}
        <FeatureCard className="p-6 sm:p-8 space-y-6">
          <div className="pb-5 border-b border-hairline">
            <div className="flex items-center gap-2 mb-1.5">
              <BadgePill label="Academic Desk" color="purple" />
              <span className="text-xs text-ink-muted">• Examination Workspace</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-ink tracking-tight">
              Create Examination
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-ink-muted leading-relaxed">
              {isBranchManager
                ? "Set up an examination to immediately open student submission windows. Question Paper can be attached now or uploaded prior to evaluation."
                : "Set up an examination to immediately open student submission windows. Question Paper and Official Answer Key can be uploaded now or attached later prior to AI grading."}
            </p>
          </div>

          <form
            onSubmit={handleSubmit}
            className={`space-y-6 transition-all duration-200 ${
              isSubmitting ? "pointer-events-none opacity-40 select-none filter blur-[1px]" : ""
            }`}
          >
            {/* Title & Subject Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-ink-secondary block mb-1.5">
                  Examination Title *
                </label>
                <input
                  type="text"
                  required
                  disabled={isSubmitting}
                  placeholder="e.g. Physics Mid-Term Class XI"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full rounded-md border border-hairline bg-surface p-2.5 text-xs text-ink placeholder:text-ink-faint focus:border-primary focus:outline-none transition-colors"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-ink-secondary block mb-1.5">
                  Subject *
                </label>
                <input
                  type="text"
                  required
                  disabled={isSubmitting}
                  placeholder="e.g. Physics / Mathematics / Chemistry"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full rounded-md border border-hairline bg-surface p-2.5 text-xs text-ink placeholder:text-ink-faint focus:border-primary focus:outline-none transition-colors"
                />
              </div>
            </div>

            {/* Hidden File Inputs */}
            <input
              ref={qpInputRef}
              type="file"
              multiple
              disabled={isSubmitting}
              accept=".pdf,.png,.jpg,.jpeg,.webp,.bmp"
              className="hidden"
              onChange={handleQpChange}
            />
            <input
              ref={akInputRef}
              type="file"
              multiple
              disabled={isSubmitting}
              accept=".pdf,.png,.jpg,.jpeg,.webp,.bmp"
              className="hidden"
              onChange={handleAkChange}
            />

            {/* Multi-File Uploads Section */}
            <div className={`grid gap-4 ${isRootAdmin ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1"}`}>
              {/* 1. Question Paper Upload Box */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  if (!isSubmitting) setIsQpDragging(true);
                }}
                onDragLeave={() => setIsQpDragging(false)}
                onDrop={handleQpDrop}
                className={`rounded-lg border-2 border-dashed p-5 flex flex-col justify-between transition-colors ${
                  isSubmitting
                    ? "border-hairline bg-canvas-soft opacity-60 cursor-not-allowed pointer-events-none"
                    : isQpDragging
                    ? "border-primary bg-[#edf5fd]"
                    : qpFiles.length > 0
                    ? "border-hairline bg-surface"
                    : "border-hairline bg-canvas-soft/50 hover:bg-canvas-soft hover:border-primary"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <FileText className="h-5 w-5 text-primary" />
                      <span className="text-xs font-bold text-ink">
                        Question Paper <span className="text-[11px] font-normal text-ink-muted">(Optional)</span>
                      </span>
                    </div>
                    {qpFiles.length > 0 && (
                      <BadgePill label={`${qpFiles.length} ${qpFiles.length === 1 ? "file" : "files"}`} color="sky" />
                    )}
                  </div>
                  <p className="text-[11px] text-ink-muted mb-3">
                    Upload PDF or photos now, or attach later before AI rubric extraction.
                  </p>

                  {/* Selected File List */}
                  {qpFiles.length > 0 ? (
                    <div className="space-y-1.5 max-h-48 overflow-y-auto mb-3 pr-1">
                      {qpFiles.map((f, idx) => {
                        const isPdf = f.name.toLowerCase().endsWith(".pdf");
                        return (
                          <div
                            key={`${f.name}-${idx}`}
                            className="flex items-center justify-between gap-2 bg-canvas-soft border border-hairline rounded-md px-2.5 py-1.5 text-[11px]"
                          >
                            <div className="flex items-center gap-2 truncate">
                              <span className="h-4 w-4 rounded-full bg-surface border border-hairline text-ink-muted flex items-center justify-center text-[10px] font-mono shrink-0">
                                {idx + 1}
                              </span>
                              {isPdf ? (
                                <FileCheck2 className="h-3.5 w-3.5 text-primary shrink-0" />
                              ) : (
                                <ImageIcon className="h-3.5 w-3.5 text-teal-600 shrink-0" />
                              )}
                              <span className="truncate text-ink font-medium">
                                {f.name}
                              </span>
                              <span className="text-[10px] text-ink-muted shrink-0">
                                ({formatFileSize(f.size)})
                              </span>
                            </div>
                            <button
                              type="button"
                              disabled={isSubmitting}
                              onClick={() => handleRemoveQpFile(idx)}
                              className="text-ink-muted hover:text-red-600 p-0.5 shrink-0 transition-colors"
                              title="Remove file"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div
                      onClick={() => {
                        if (!isSubmitting) qpInputRef.current?.click();
                      }}
                      className="border border-dashed border-hairline rounded-md p-4 text-center my-2 cursor-pointer hover:bg-canvas-soft transition-colors"
                    >
                      <Upload className="h-6 w-6 text-ink-muted mx-auto mb-1.5" />
                      <span className="text-xs text-ink font-medium block">
                        Click to browse or drop Question Paper
                      </span>
                      <span className="text-[10px] text-ink-muted">
                        PDF, JPG, PNG
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 mt-2 pt-2 border-t border-hairline">
                  <ButtonUtility
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => {
                      if (!isSubmitting) qpInputRef.current?.click();
                    }}
                    className="flex-1 py-1.5 text-xs"
                  >
                    <Plus className="h-3.5 w-3.5 mr-1 text-primary" />
                    {qpFiles.length === 0 ? "Select File(s)" : "Add More"}
                  </ButtonUtility>
                  {qpFiles.length > 0 && (
                    <ButtonUtility
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => {
                        if (!isSubmitting) setQpFiles([]);
                      }}
                      className="py-1.5 text-xs text-red-600 hover:bg-red-50"
                      title="Clear all question paper files"
                    >
                      <Trash2 className="h-3 w-3 mr-1" />
                      Clear
                    </ButtonUtility>
                  )}
                </div>
              </div>

              {/* 2. Official Answer Key Upload Box (Strictly Root Admin Only) */}
              {isRootAdmin && (
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (!isSubmitting) setIsAkDragging(true);
                  }}
                  onDragLeave={() => setIsAkDragging(false)}
                  onDrop={handleAkDrop}
                  className={`rounded-lg border-2 border-dashed p-5 flex flex-col justify-between transition-colors ${
                    isSubmitting
                      ? "border-hairline bg-canvas-soft opacity-60 cursor-not-allowed pointer-events-none"
                      : isAkDragging
                      ? "border-[#1aae39] bg-[#eaf7ed]"
                      : akFiles.length > 0
                      ? "border-hairline bg-surface"
                      : "border-hairline bg-canvas-soft/50 hover:bg-canvas-soft hover:border-primary"
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Sparkles className="h-5 w-5 text-[#1aae39]" />
                        <span className="text-xs font-bold text-ink">
                          Official Answer Key <span className="text-[11px] font-normal text-ink-muted">(Optional)</span>
                        </span>
                      </div>
                      {akFiles.length > 0 && (
                        <BadgePill label={`${akFiles.length} ${akFiles.length === 1 ? "file" : "files"}`} color="green" />
                      )}
                    </div>
                    <p className="text-[11px] text-ink-muted mb-3">
                      Root Admin can upload now to generate rubric draft, or attach later prior to evaluation.
                    </p>

                    {/* Selected File List */}
                    {akFiles.length > 0 ? (
                      <div className="space-y-1.5 max-h-48 overflow-y-auto mb-3 pr-1">
                        {akFiles.map((f, idx) => {
                          const isPdf = f.name.toLowerCase().endsWith(".pdf");
                          return (
                            <div
                              key={`${f.name}-${idx}`}
                              className="flex items-center justify-between gap-2 bg-canvas-soft border border-hairline rounded-md px-2.5 py-1.5 text-[11px]"
                            >
                              <div className="flex items-center gap-2 truncate">
                                <span className="h-4 w-4 rounded-full bg-surface border border-hairline text-ink-muted flex items-center justify-center text-[10px] font-mono shrink-0">
                                  {idx + 1}
                                </span>
                                {isPdf ? (
                                  <FileCheck2 className="h-3.5 w-3.5 text-[#1aae39] shrink-0" />
                                ) : (
                                  <ImageIcon className="h-3.5 w-3.5 text-teal-600 shrink-0" />
                                )}
                                <span className="truncate text-ink font-medium">
                                  {f.name}
                                </span>
                                <span className="text-[10px] text-ink-muted shrink-0">
                                  ({formatFileSize(f.size)})
                                </span>
                              </div>
                              <button
                                type="button"
                                disabled={isSubmitting}
                                onClick={() => handleRemoveAkFile(idx)}
                                className="text-ink-muted hover:text-red-600 p-0.5 shrink-0 transition-colors"
                                title="Remove file"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div
                        onClick={() => {
                          if (!isSubmitting) akInputRef.current?.click();
                        }}
                        className="border border-dashed border-hairline rounded-md p-4 text-center my-2 cursor-pointer hover:bg-canvas-soft transition-colors"
                      >
                        <Upload className="h-6 w-6 text-ink-muted mx-auto mb-1.5" />
                        <span className="text-xs text-ink font-medium block">
                          Click to browse or drop Answer Key
                        </span>
                        <span className="text-[10px] text-ink-muted">
                          PDF, JPG, PNG
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 mt-2 pt-2 border-t border-hairline">
                    <ButtonUtility
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => {
                        if (!isSubmitting) akInputRef.current?.click();
                      }}
                      className="flex-1 py-1.5 text-xs"
                    >
                      <Plus className="h-3.5 w-3.5 mr-1 text-[#1aae39]" />
                      {akFiles.length === 0 ? "Select File(s)" : "Add More"}
                    </ButtonUtility>
                    {akFiles.length > 0 && (
                      <ButtonUtility
                        type="button"
                        disabled={isSubmitting}
                        onClick={() => {
                          if (!isSubmitting) setAkFiles([]);
                        }}
                        className="py-1.5 text-xs text-red-600 hover:bg-red-50"
                        title="Clear all answer key files"
                      >
                        <Trash2 className="h-3 w-3 mr-1" />
                        Clear
                      </ButtonUtility>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Governance notice for Branch Managers */}
            {!isRootAdmin && (
              <div className="flex items-center gap-3 p-3.5 rounded-lg bg-canvas-soft border border-hairline text-ink-muted text-xs">
                <div className="h-8 w-8 rounded-md bg-surface border border-hairline flex items-center justify-center shrink-0 text-primary">
                  <ShieldCheck className="h-4 w-4" />
                </div>
                <div className="leading-relaxed">
                  <span className="font-semibold text-ink">Centralized Rubric Governance:</span> Official Answer Key upload and AI Rubric Synthesis are restricted to Root Administration. You can attach Question Papers now and open student submission windows immediately.
                </div>
              </div>
            )}

            {/* Extra Notes */}
            <div>
              <label className="text-xs font-semibold text-ink-secondary block mb-1.5">
                Teacher's Special Grading Instructions (Optional)
              </label>
              <textarea
                rows={3}
                disabled={isSubmitting}
                placeholder="e.g. Deduct 1 mark if SI units are omitted in numericals. Accept energy conservation alternatives..."
                value={extraNotes}
                onChange={(e) => setExtraNotes(e.target.value)}
                className="w-full rounded-md border border-hairline bg-surface p-2.5 text-xs text-ink placeholder:text-ink-faint focus:border-primary focus:outline-none transition-colors"
              />
            </div>

            <ButtonPrimary
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 text-sm font-semibold"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  <span>
                    {isSynthesizingRubric
                      ? `Synthesizing Rubric with Agent (${elapsedSeconds}s)...`
                      : "Creating Examination..."}
                  </span>
                </>
              ) : isSynthesizingRubric ? (
                <>
                  <Cpu className="h-4 w-4 mr-2" />
                  <span>Create Exam & Synthesize Rubric →</span>
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" />
                  <span>Create Examination & Open for Submissions →</span>
                </>
              )}
            </ButtonPrimary>
          </form>
        </FeatureCard>
      </div>
    </div>
  );
}
