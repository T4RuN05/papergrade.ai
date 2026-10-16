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

const PIPELINE_STEPS = [
  {
    title: "Document Canonicalization",
    desc: "Converting Question Paper & Answer Key into high-res multimodal pages",
  },
  {
    title: "Gemini Vision AI Analysis",
    desc: "Reading questions, sub-parts, equations, and official expected answers",
  },
  {
    title: "Marking Scheme Extraction",
    desc: "Identifying optional questions, choice limits, and mark allocations",
  },
  {
    title: "Synthesizing Rubric Draft",
    desc: "Formulating step-by-step criteria breakdown and model solutions",
  },
];

export default function NewExamPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { selectedBranch } = useTenant();
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

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (isSubmitting) {
      setElapsedSeconds(0);
      setCurrentStep(0);
      const start = Date.now();
      interval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - start) / 1000);
        setElapsedSeconds(elapsed);
        if (elapsed < 3) {
          setCurrentStep(0);
        } else if (elapsed < 10) {
          setCurrentStep(1);
        } else if (elapsed < 18) {
          setCurrentStep(2);
        } else {
          setCurrentStep(3);
        }
      }, 500);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isSubmitting]);

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

    const hasBothFiles = qpFiles.length > 0 && akFiles.length > 0;
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

      // If Answer Key was provided, upload it to generate draft rubric
      if (akFiles.length > 0) {
        const akFormData = new FormData();
        for (const file of akFiles) {
          akFormData.append("answer_key", file);
        }
        await api.uploadAnswerKey(createdExam.id, akFormData);
      }

      if (hasBothFiles) {
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
        {/* Full Interactive Processing Overlay when Rubric Generation is in Progress */}
        {isSubmitting && (
          <div className="absolute inset-0 z-30 rounded-xl bg-surface/96 backdrop-blur-md flex flex-col items-center justify-center p-6 sm:p-8 text-center animate-in fade-in duration-200 border border-hairline shadow-notion-modal">
            {/* AI Spinner Icon */}
            <div className="relative mb-4">
              <div className="h-14 w-14 rounded-2xl bg-[#edf5fd] border border-primary/20 flex items-center justify-center text-primary shadow-xs">
                <Sparkles className="h-7 w-7 animate-spin" />
              </div>
            </div>

            {/* Header Badge */}
            <BadgePill label="Gemini Multimodal AI Active" color="purple" />

            <h2 className="text-xl sm:text-2xl font-bold text-ink tracking-tight mt-2.5">
              Generating Structured Exam Rubric
            </h2>
            <p className="mt-1 text-xs sm:text-sm text-ink-muted max-w-lg leading-relaxed">
              Gemini is analyzing your Question Paper and Answer Key to extract question numbers, choice constraints, marks distribution, and step-by-step criteria.
            </p>

            {/* Document Summary Chips */}
            <div className="flex flex-wrap items-center justify-center gap-2 mt-4 text-xs">
              <div className="rounded-md bg-canvas-soft border border-hairline px-3 py-1.5 text-ink flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5 text-primary" />
                <span>
                  Question Paper: <strong>{qpFiles.length} {qpFiles.length === 1 ? "file" : "files"}</strong>
                </span>
              </div>
              <div className="rounded-md bg-canvas-soft border border-hairline px-3 py-1.5 text-ink flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-[#1aae39]" />
                <span>
                  Answer Key: <strong>{akFiles.length} {akFiles.length === 1 ? "file" : "files"}</strong>
                </span>
              </div>
              <div className="rounded-md bg-[#edf5fd] border border-primary/20 px-3 py-1.5 text-primary font-mono font-semibold flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 animate-spin" />
                <span>{elapsedSeconds}s elapsed</span>
              </div>
            </div>

            {/* Animated Pipeline Stepper */}
            <div className="w-full max-w-lg mt-6 bg-canvas-soft border border-hairline rounded-lg p-4 text-left space-y-3">
              {PIPELINE_STEPS.map((step, idx) => {
                const isCompleted = idx < currentStep;
                const isCurrent = idx === currentStep;
                return (
                  <div
                    key={idx}
                    className={`flex items-start gap-3 transition-opacity duration-300 ${
                      isCompleted
                        ? "opacity-90"
                        : isCurrent
                        ? "opacity-100 font-medium"
                        : "opacity-40"
                    }`}
                  >
                    <div className="mt-0.5">
                      {isCompleted ? (
                        <CheckCircle2 className="h-4 w-4 text-[#1aae39]" />
                      ) : isCurrent ? (
                        <Loader2 className="h-4 w-4 text-primary animate-spin" />
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
                              ? "text-primary font-bold"
                              : isCompleted
                              ? "text-ink font-semibold"
                              : "text-ink-muted"
                          }`}
                        >
                          {step.title}
                        </span>
                        {isCurrent && (
                          <BadgePill label="In Progress" color="sky" />
                        )}
                        {isCompleted && (
                          <BadgePill label="Completed" color="green" />
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

            {/* Progress bar */}
            <div className="w-full max-w-lg mt-4 space-y-1.5">
              <div className="h-2 w-full bg-canvas-soft border border-hairline rounded-full overflow-hidden relative">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[11px] text-ink-muted px-1">
                <span>Gemini API extraction running...</span>
                <span>Typically 10–25s</span>
              </div>
            </div>

            {/* Bottom notice */}
            <div className="flex items-center gap-1.5 text-xs text-ink-muted mt-5">
              <ShieldCheck className="h-4 w-4 text-[#1aae39] shrink-0" />
              <span>All input fields are locked during generation. Please keep this tab open.</span>
            </div>
          </div>
        )}

        {/* Main Card */}
        <FeatureCard className="p-6 sm:p-8 space-y-6">
          <div className="pb-5 border-b border-hairline">
            <div className="flex items-center gap-2 mb-1.5">
              <BadgePill label="Academic Desk" color="purple" />
              <span className="text-xs text-ink-muted">• Multimodal Vision Pipeline</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-ink tracking-tight">
              Create Examination
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-ink-muted leading-relaxed">
              Set up an examination to immediately open student submission windows. Question Paper and Official Answer Key can be uploaded now or attached later prior to AI grading.
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

              {/* 2. Official Answer Key Upload Box */}
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
                    Root Admin can upload now, or add it later after student submissions close.
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
            </div>

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
                    {qpFiles.length > 0 && akFiles.length > 0
                      ? `Extracting Rubric with Gemini AI (${elapsedSeconds}s)...`
                      : "Creating Examination..."}
                  </span>
                </>
              ) : qpFiles.length > 0 && akFiles.length > 0 ? (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  <span>Extract Rubric & Proceed to Review →</span>
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
