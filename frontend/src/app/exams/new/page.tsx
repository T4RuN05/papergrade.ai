"use client";

import React, { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Upload,
  Sparkles,
  FileText,
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
  Users,
  Check,
} from "lucide-react";
import { api } from "@/lib/api";
import { AppleSelect, PageBackBar } from "@/components/ui";
import { useToast, queueToast } from "@/lib/ToastContext";
import LogoLoader from "@/components/LogoLoader/LogoLoader";
import { useTenant } from "@/lib/TenantContext";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";

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
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { selectedBranch, isRootAdmin, isInstituteDirector, isBranchManager } = useTenant();
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

  // Batch Scoping: "ALL" (Whole branch) or "SPECIFIC" (Selected batches)
  const [batchScopeMode, setBatchScopeMode] = useState<"ALL" | "SPECIFIC">("ALL");
  const [selectedBatchIds, setSelectedBatchIds] = useState<string[]>([]);
  const [batches, setBatches] = useState<any[]>([]);
  const [loadingBatches, setLoadingBatches] = useState(false);

  // Subject Dropdown Selection
  const [availableSubjects, setAvailableSubjects] = useState<string[]>([]);
  const [loadingSubjects, setLoadingSubjects] = useState(false);
  const [isCustomSubject, setIsCustomSubject] = useState(false);
  const [customSubjectText, setCustomSubjectText] = useState("");

  // Fetch subjects for current branch/institute
  useEffect(() => {
    let isMounted = true;
    async function fetchSubjects() {
      setLoadingSubjects(true);
      try {
        const subs = await api.listSubjects(selectedBranch?.id);
        if (isMounted) {
          const list = Array.isArray(subs) && subs.length > 0 ? subs : ["Physics", "Chemistry", "Maths", "Biology"];
          setAvailableSubjects(list);
          if (list.length > 0) {
            setSubject((prev) => prev || list[0]);
          }
        }
      } catch (e) {
        console.error("Failed to load subjects:", e);
        if (isMounted) {
          const fallback = ["Physics", "Chemistry", "Maths", "Biology"];
          setAvailableSubjects(fallback);
          setSubject((prev) => prev || fallback[0]);
        }
      } finally {
        if (isMounted) setLoadingSubjects(false);
      }
    }
    fetchSubjects();
    return () => {
      isMounted = false;
    };
  }, [selectedBranch?.id]);

  // Fetch batches when selected branch changes
  useEffect(() => {
    let isMounted = true;
    async function fetchBatches() {
      setLoadingBatches(true);
      try {
        const list = await api.listBatches(selectedBranch?.id);
        if (isMounted) {
          setBatches(Array.isArray(list) ? list : []);
        }
      } catch (err) {
        console.error("Failed to load batches:", err);
        if (isMounted) setBatches([]);
      } finally {
        if (isMounted) setLoadingBatches(false);
      }
    }
    fetchBatches();
    return () => {
      isMounted = false;
    };
  }, [selectedBranch?.id]);

  const handleToggleBatch = (id: string) => {
    if (isSubmitting) return;
    setSelectedBatchIds((prev) =>
      prev.includes(id) ? prev.filter((b) => b !== id) : [...prev, id]
    );
  };

  const handleSelectAllBatches = () => {
    if (isSubmitting) return;
    setSelectedBatchIds(batches.map((b) => b.id));
  };

  const handleClearBatches = () => {
    if (isSubmitting) return;
    setSelectedBatchIds([]);
  };

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

    if (batchScopeMode === "SPECIFIC" && selectedBatchIds.length === 0) {
      toast.warning("Please select at least one batch for this examination, or switch to 'Whole Branch'.", {
        title: "No Batches Selected",
      });
      return;
    }

    const shouldGenerateRubric = isRootAdmin && qpFiles.length > 0 && akFiles.length > 0;
    const hasAnswerKey = isRootAdmin && akFiles.length > 0;
    setIsSubmitting(true);

    let activeLoadingToastId: string | null = null;
    try {
      const formData = new FormData();
      formData.append("title", title.trim());
      formData.append("subject", subject.trim());
      if (selectedBranch?.id) {
        formData.append("branch_id", selectedBranch.id);
      }
      formData.append("batch_scope", batchScopeMode);
      if (batchScopeMode === "SPECIFIC") {
        formData.append("batch_ids", JSON.stringify(selectedBatchIds));
      }
      if (extraNotes.trim()) formData.append("extra_notes", extraNotes.trim());

      for (const file of qpFiles) {
        formData.append("question_paper", file);
      }

      if (hasAnswerKey) {
        activeLoadingToastId = toast.loading(
          "Creating exam and uploading Answer Key...",
          { title: "Uploading Answer Key" }
        );
      }

      const createdExam = await api.createExam(formData);

      if (hasAnswerKey) {
        const akFormData = new FormData();
        for (const file of akFiles) {
          akFormData.append("answer_key", file);
        }
        akFormData.append("auto_generate_rubric", "false");
        await api.uploadAnswerKey(createdExam.id, akFormData);

        if (activeLoadingToastId) {
          toast.dismiss(activeLoadingToastId);
          activeLoadingToastId = null;
        }
        toast.success("Answer Key uploaded successfully!", {
          title: "Answer Key Attached",
        });

        activeLoadingToastId = toast.loading(
          "Generating AI draft rubric with Gemini Vision...",
          { title: "Generating Rubrics" }
        );
        await api.generateRubric(createdExam.id);
        toast.dismiss(activeLoadingToastId);
        activeLoadingToastId = null;
      }

      const targetUrl = shouldGenerateRubric ? `/exams/${createdExam.id}/rubric` : `/exams/${createdExam.id}`;
      if (shouldGenerateRubric) {
        queueToast({
          type: "success",
          title: "Exam Created & Rubric Generated",
          message: `Exam "${title.trim()}" created with AI rubric draft ready for review.`,
        });
      } else {
        queueToast({
          type: "success",
          title: "Exam Created",
          message: `Exam "${title.trim()}" created successfully! You can now open student submission windows.`,
        });
      }

      setIsSubmitting(false);
      queryClient.invalidateQueries({ queryKey: queryKeys.exams.all() });
      try {
        router.push(targetUrl);
      } catch {
        // Fallback
      }
      setTimeout(() => {
        if (typeof window !== "undefined" && window.location.pathname !== targetUrl) {
          window.location.href = targetUrl;
        }
      }, 350);
    } catch (err: any) {
      if (activeLoadingToastId) toast.dismiss(activeLoadingToastId);
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
    <div className="max-w-6xl mx-auto space-y-6 pb-16">
      {/* Fixed Backing Navigation */}
      <PageBackBar
        backHref="/exams"
        backLabel="Back to Examinations"
        disabled={isSubmitting}
      />

      <div className="relative">
        {/* Differentiated Processing Overlays */}
        {isSubmitting && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200">
            {isSynthesizingRubric ? (
              <div className="notion-card rounded-lg relative w-full max-w-xl shadow-notion-modal flex flex-col items-center justify-center p-6 sm:p-8 text-center my-auto">
                <div className="h-12 w-12 rounded-lg bg-canvas-soft border border-hairline flex items-center justify-center text-primary mb-4">
                  <Cpu className="h-6 w-6" />
                </div>

                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-canvas-soft border border-hairline text-ink-secondary text-xs font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                  Autonomous Rubric Agent Active
                </span>

                <h2 className="notion-heading-2 text-xl sm:text-2xl text-ink mt-3">
                  Synthesizing Structured Exam Rubric
                </h2>
                <p className="mt-1 text-xs sm:text-sm text-ink-muted max-w-lg leading-relaxed">
                  Dissecting question paper layout, validating marking constraints, and formulating step-by-step evaluation criteria.
                </p>

                {/* Document Summary Chips */}
                <div className="flex flex-wrap items-center justify-center gap-2 mt-4 text-xs">
                  <div className="rounded-md bg-canvas-soft border border-hairline px-3 py-1.5 text-ink flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span>
                      Question Paper: <strong>{qpFiles.length} {qpFiles.length === 1 ? "file" : "files"}</strong>
                    </span>
                  </div>
                  <div className="rounded-md bg-canvas-soft border border-hairline px-3 py-1.5 text-ink flex items-center gap-1.5">
                    <FileCheck2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                    <span>
                      Answer Key: <strong>{akFiles.length} {akFiles.length === 1 ? "file" : "files"}</strong>
                    </span>
                  </div>
                  <div className="rounded-md bg-canvas-soft border border-hairline px-3 py-1.5 text-ink-secondary font-mono tabular-nums font-medium flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span>{elapsedSeconds}s elapsed</span>
                  </div>
                </div>

                {/* Agentic Timeline Feed */}
                <div className="w-full max-w-lg mt-5 bg-canvas-soft border border-hairline rounded-lg p-4 text-left space-y-2.5">
                  {AGENTIC_RUBRIC_STEPS.map((step, idx) => {
                    const isCompleted = idx < currentStep;
                    const isCurrent = idx === currentStep;
                    return (
                      <div
                        key={idx}
                        className={`flex items-start gap-3 transition-opacity duration-300 ${
                          isCompleted ? "opacity-90" : isCurrent ? "opacity-100" : "opacity-40"
                        }`}
                      >
                        <div className="mt-0.5 shrink-0">
                          {isCompleted ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                          ) : isCurrent ? (
                            <Loader2 className="h-4 w-4 text-primary animate-spin" />
                          ) : (
                            <div className="h-4 w-4 rounded-full border border-hairline bg-surface flex items-center justify-center text-[10px] text-ink-muted font-mono">
                              {idx + 1}
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span
                              className={`text-xs ${
                                isCurrent
                                  ? "text-primary font-semibold"
                                  : isCompleted
                                  ? "text-ink font-semibold"
                                  : "text-ink-muted"
                              }`}
                            >
                              {step.title}
                            </span>
                            {isCurrent && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-ink-secondary bg-surface px-2 py-0.5 rounded-full border border-hairline shrink-0">
                                <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                                In Progress
                              </span>
                            )}
                            {isCompleted && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-ink-secondary bg-surface px-2 py-0.5 rounded-full border border-hairline shrink-0">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
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

                {/* Progress Bar */}
                <div className="w-full max-w-lg mt-4 space-y-1.5">
                  <div className="h-1.5 w-full bg-canvas-soft border border-hairline rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all duration-300 ease-out"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-ink-muted px-0.5 font-mono">
                    <span>Synthesizing rubric criteria...</span>
                    <span>Autonomous Pipeline</span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 text-xs text-ink-muted mt-4">
                  <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>Draft rubric will be opened in the interactive editor for review and approval.</span>
                </div>
              </div>
            ) : (
              <div className="notion-card rounded-lg relative w-full max-w-md shadow-notion-modal flex flex-col items-center justify-center p-6 sm:p-8 text-center my-auto">
                <LogoLoader size={44} duration={1.3} label="Creating Examination" className="mb-3" />

                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-canvas-soft border border-hairline text-ink-muted text-[11px] font-medium mb-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  Academic Operations
                </div>

                <h2 className="notion-heading-3 text-lg sm:text-xl text-ink">
                  Creating Examination...
                </h2>
                <p className="mt-1 text-xs text-ink-muted max-w-sm leading-relaxed">
                  Registering examination record, linking branch settings, and initializing workspace.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Main Card */}
        <div className="notion-card rounded-lg p-4 sm:p-6 md:p-8 space-y-6">
          <div className="pb-5 border-b border-hairline space-y-1.5">
            <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
              <span className="notion-eyebrow text-ink-secondary">Academic Desk</span>
              <span className="text-ink-faint">•</span>
              <span>Examination Workspace</span>
            </div>
            <h1 className="notion-heading-2 text-xl sm:text-2xl text-ink">
              Create Examination
            </h1>
            <p className="text-xs sm:text-sm text-ink-muted leading-relaxed">
              {isBranchManager || isInstituteDirector
                ? "Set up an examination ledger. Question Paper can be attached now or uploaded prior to evaluation."
                : "Set up an examination ledger. Question Paper and Official Answer Key can be uploaded now or attached later prior to AI grading."}
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
                  className="w-full rounded-xs border border-[#dddddd] dark:border-[#333333] bg-surface px-3 py-2 text-xs sm:text-sm text-ink placeholder:text-ink-faint focus:border-primary focus:outline-none transition-colors"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-ink-secondary block">
                    Subject *
                  </label>
                  {!isCustomSubject ? (
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => {
                        setIsCustomSubject(true);
                        setCustomSubjectText("");
                        setSubject("");
                      }}
                      className="text-xs font-medium text-primary hover:underline inline-flex items-center gap-0.5 cursor-pointer"
                    >
                      <Plus className="h-3 w-3" />
                      Add Custom
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => {
                        setIsCustomSubject(false);
                        if (availableSubjects.length > 0) {
                          setSubject(availableSubjects[0]);
                        }
                      }}
                      className="text-xs font-medium text-primary hover:underline inline-flex items-center gap-0.5 cursor-pointer"
                    >
                      Choose from list
                    </button>
                  )}
                </div>

                {!isCustomSubject ? (
                  <AppleSelect
                    value={subject}
                    onChange={(val) => {
                      if (val === "__CUSTOM__") {
                        setIsCustomSubject(true);
                        setCustomSubjectText("");
                        setSubject("");
                      } else {
                        setSubject(val);
                      }
                    }}
                    placeholder="Select Subject..."
                    disabled={isSubmitting || loadingSubjects}
                    options={[
                      ...availableSubjects.map((sub) => ({ value: sub, label: sub })),
                      { value: "__CUSTOM__", label: "+ Other / Custom Subject..." },
                    ]}
                    className="w-full"
                  />
                ) : (
                  <div className="space-y-1.5">
                    <input
                      type="text"
                      required
                      autoFocus
                      disabled={isSubmitting}
                      placeholder="Type custom subject name (e.g. Computer Science)"
                      value={customSubjectText}
                      onChange={(e) => {
                        setCustomSubjectText(e.target.value);
                        setSubject(e.target.value);
                      }}
                      className="w-full rounded-xs border border-[#dddddd] dark:border-[#333333] bg-surface px-3 py-2 text-xs sm:text-sm text-ink placeholder:text-ink-faint focus:border-primary focus:outline-none transition-colors"
                    />
                    <p className="text-[11px] text-ink-muted">
                      Custom subject will be attached to this exam.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Examination Scope & Batch Targeting */}
            <div className="rounded-lg border border-hairline bg-canvas-soft p-3.5 sm:p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-3 border-b border-hairline">
                <div className="flex items-start sm:items-center gap-2.5">
                  <div className="h-7 w-7 rounded-md bg-surface border border-hairline flex items-center justify-center text-ink-secondary shrink-0 mt-0.5 sm:mt-0">
                    <Users className="h-3.5 w-3.5 shrink-0" />
                  </div>
                  <div>
                    <h3 className="notion-section-title text-sm text-ink">
                      Student Access &amp; Batch Scope
                    </h3>
                    <p className="text-xs text-ink-muted">
                      Define which cohorts can view this exam and submit answer sheets.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 self-start sm:self-auto shrink-0">
                  <span className="text-xs text-ink-muted">Target:</span>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-surface border border-hairline text-ink tabular-nums shrink-0">
                    {batchScopeMode === "ALL"
                      ? "Whole Branch"
                      : `${selectedBatchIds.length} of ${batches.length} Batches`}
                  </span>
                </div>
              </div>

              {/* Mode Switcher Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => setBatchScopeMode("ALL")}
                  className={`p-3.5 rounded-lg border text-left transition-colors relative flex flex-col justify-between cursor-pointer ${
                    batchScopeMode === "ALL"
                      ? "bg-surface border-primary ring-1 ring-primary/20"
                      : "bg-surface border-hairline hover:border-ink/25"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className={`h-4 w-4 rounded-full shrink-0 flex items-center justify-center border transition-colors ${
                          batchScopeMode === "ALL"
                            ? "border-primary bg-primary text-white"
                            : "border-hairline bg-surface"
                        }`}
                      >
                        {batchScopeMode === "ALL" && <Check className="h-2.5 w-2.5 stroke-[3]" />}
                      </div>
                      <span className="text-xs font-semibold text-ink">
                        Whole Branch (All Batches)
                      </span>
                    </div>
                    <span className="px-2 py-0.5 text-[11px] font-medium rounded-full bg-canvas-soft border border-hairline text-ink-muted shrink-0">
                      Default
                    </span>
                  </div>
                  <p className="text-[11px] text-ink-muted mt-2 pl-6 leading-relaxed">
                    Active for all cohorts in{" "}
                    <strong className="text-ink-secondary">
                      {selectedBranch?.name || "this branch"}
                    </strong>
                    . Every student enrolled in the branch can see and submit.
                  </p>
                </button>

                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => setBatchScopeMode("SPECIFIC")}
                  className={`p-3.5 rounded-lg border text-left transition-colors relative flex flex-col justify-between cursor-pointer ${
                    batchScopeMode === "SPECIFIC"
                      ? "bg-surface border-primary ring-1 ring-primary/20"
                      : "bg-surface border-hairline hover:border-ink/25"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className={`h-4 w-4 rounded-full shrink-0 flex items-center justify-center border transition-colors ${
                          batchScopeMode === "SPECIFIC"
                            ? "border-primary bg-primary text-white"
                            : "border-hairline bg-surface"
                        }`}
                      >
                        {batchScopeMode === "SPECIFIC" && <Check className="h-2.5 w-2.5 stroke-[3]" />}
                      </div>
                      <span className="text-xs font-semibold text-ink">
                        Select Batches (Single / Multiple)
                      </span>
                    </div>
                    <span
                      className={`px-2 py-0.5 text-[11px] font-medium rounded-full shrink-0 tabular-nums ${
                        batchScopeMode === "SPECIFIC" && selectedBatchIds.length > 0
                          ? "bg-primary text-white"
                          : "bg-canvas-soft border border-hairline text-ink-muted"
                      }`}
                    >
                      {selectedBatchIds.length} Selected
                    </span>
                  </div>
                  <p className="text-[11px] text-ink-muted mt-2 pl-6 leading-relaxed">
                    Limit this examination to single or multiple designated batches. Only enrolled
                    students in selected batches can view and submit.
                  </p>
                </button>
              </div>

              {/* Specific Batches Selector Drawer */}
              {batchScopeMode === "SPECIFIC" && (
                <div className="pt-2 space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-ink-secondary">
                        Choose Active Batches:
                      </span>
                      {selectedBatchIds.length === 0 && (
                        <span className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                          (Select at least one batch)
                        </span>
                      )}
                    </div>
                    {batches.length > 0 && (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleSelectAllBatches}
                          disabled={isSubmitting}
                          className="text-xs font-medium text-primary hover:underline cursor-pointer"
                        >
                          Select All ({batches.length})
                        </button>
                        <span className="text-ink-faint text-[10px]">•</span>
                        <button
                          type="button"
                          onClick={handleClearBatches}
                          disabled={isSubmitting}
                          className="text-xs font-medium text-ink-muted hover:text-red-600 hover:underline cursor-pointer"
                        >
                          Clear
                        </button>
                      </div>
                    )}
                  </div>

                  {loadingBatches ? (
                    <div className="p-4 rounded-lg bg-surface border border-hairline flex items-center justify-center gap-2 text-xs text-ink-muted">
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      <span>Loading branch batches...</span>
                    </div>
                  ) : batches.length === 0 ? (
                    <div className="p-4 rounded-lg bg-surface border border-hairline text-center space-y-1">
                      <p className="text-xs font-semibold text-ink">No batches found</p>
                      <p className="text-[11px] text-ink-muted">
                        No batches have been created in this branch yet. You can create batches in
                        Batches &amp; Roster, or keep Whole Branch scope.
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 max-h-56 overflow-y-auto p-1.5 rounded-lg border border-hairline bg-surface">
                      {batches.map((batch) => {
                        const isSelected = selectedBatchIds.includes(batch.id);
                        return (
                          <div
                            key={batch.id}
                            onClick={() => handleToggleBatch(batch.id)}
                            className={`p-2.5 rounded-md border transition-colors cursor-pointer select-none flex items-start gap-2.5 ${
                              isSelected
                                ? "bg-canvas-soft border-primary ring-1 ring-primary/20"
                                : "bg-surface border-hairline hover:bg-canvas-soft"
                            }`}
                          >
                            <div
                              className={`mt-0.5 h-4 w-4 rounded-xs shrink-0 flex items-center justify-center border transition-colors ${
                                isSelected
                                  ? "bg-primary border-primary text-white"
                                  : "border-hairline bg-surface"
                              }`}
                            >
                              {isSelected && <Check className="h-3 w-3 stroke-[3]" />}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-semibold text-ink truncate leading-tight">
                                {batch.name}
                              </div>
                              <div className="flex items-center gap-1.5 mt-1 text-[10px] text-ink-muted">
                                {batch.code && (
                                  <span className="font-mono bg-canvas-soft px-1.5 py-0.2 rounded-xs border border-hairline text-ink-secondary">
                                    {batch.code}
                                  </span>
                                )}
                                {batch.academic_year && (
                                  <span>{batch.academic_year}</span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
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
                className={`rounded-lg border border-dashed p-4 sm:p-5 flex flex-col justify-between transition-colors ${
                  isSubmitting
                    ? "border-hairline bg-canvas-soft opacity-60 cursor-not-allowed pointer-events-none"
                    : isQpDragging
                    ? "border-primary bg-primary/5"
                    : qpFiles.length > 0
                    ? "border-hairline bg-surface"
                    : "border-hairline bg-canvas-soft hover:border-primary"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="h-4 w-4 text-primary shrink-0" />
                      <span className="text-xs font-semibold text-ink">
                        Question Paper <span className="font-normal text-ink-muted">(Optional)</span>
                      </span>
                    </div>
                    {qpFiles.length > 0 && (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-surface border border-hairline text-ink-secondary shrink-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                        {qpFiles.length} {qpFiles.length === 1 ? "file" : "files"}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-ink-muted mb-3">
                    Upload PDF or photos now, or attach later before AI rubric extraction.
                  </p>

                  {qpFiles.length > 0 ? (
                    <div className="space-y-1.5 max-h-48 overflow-y-auto mb-3 pr-1">
                      {qpFiles.map((f, idx) => {
                        const isPdf = f.name.toLowerCase().endsWith(".pdf");
                        return (
                          <div
                            key={`${f.name}-${idx}`}
                            className="flex items-center justify-between gap-2 bg-canvas-soft border border-hairline rounded-md px-2.5 py-1.5 text-xs"
                          >
                            <div className="flex items-center gap-2 truncate">
                              <span className="h-4 w-4 rounded-full bg-surface border border-hairline text-ink-muted flex items-center justify-center text-[10px] font-mono shrink-0">
                                {idx + 1}
                              </span>
                              {isPdf ? (
                                <FileCheck2 className="h-3.5 w-3.5 text-primary shrink-0" />
                              ) : (
                                <ImageIcon className="h-3.5 w-3.5 text-ink-secondary shrink-0" />
                              )}
                              <span className="truncate text-ink font-medium">
                                {f.name}
                              </span>
                              <span className="text-[11px] text-ink-muted shrink-0">
                                ({formatFileSize(f.size)})
                              </span>
                            </div>
                            <button
                              type="button"
                              disabled={isSubmitting}
                              onClick={() => handleRemoveQpFile(idx)}
                              className="text-ink-muted hover:text-red-600 p-0.5 shrink-0 transition-colors cursor-pointer"
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
                      className="border border-dashed border-hairline rounded-md p-4 text-center my-2 cursor-pointer bg-surface hover:bg-canvas-soft transition-colors"
                    >
                      <Upload className="h-5 w-5 text-ink-muted mx-auto mb-1.5 shrink-0" />
                      <span className="text-xs text-ink font-medium block">
                        Click to browse or drop Question Paper
                      </span>
                      <span className="text-[11px] text-ink-muted">
                        PDF, JPG, PNG
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 mt-2 pt-3 border-t border-hairline">
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => {
                      if (!isSubmitting) qpInputRef.current?.click();
                    }}
                    className="notion-btn-utility flex-1 justify-center text-xs"
                  >
                    <Plus className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span>{qpFiles.length === 0 ? "Select File(s)" : "Add More"}</span>
                  </button>
                  {qpFiles.length > 0 && (
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => {
                        if (!isSubmitting) setQpFiles([]);
                      }}
                      className="notion-btn-danger justify-center text-xs"
                      title="Clear all question paper files"
                    >
                      <Trash2 className="h-3.5 w-3.5 shrink-0" />
                      <span>Clear</span>
                    </button>
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
                  className={`rounded-lg border border-dashed p-4 sm:p-5 flex flex-col justify-between transition-colors ${
                    isSubmitting
                      ? "border-hairline bg-canvas-soft opacity-60 cursor-not-allowed pointer-events-none"
                      : isAkDragging
                      ? "border-primary bg-primary/5"
                      : akFiles.length > 0
                      ? "border-hairline bg-surface"
                      : "border-hairline bg-canvas-soft hover:border-primary"
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Sparkles className="h-4 w-4 text-emerald-600 shrink-0" />
                        <span className="text-xs font-semibold text-ink">
                          Official Answer Key <span className="font-normal text-ink-muted">(Optional)</span>
                        </span>
                      </div>
                      {akFiles.length > 0 && (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-surface border border-hairline text-ink-secondary shrink-0">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          {akFiles.length} {akFiles.length === 1 ? "file" : "files"}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-ink-muted mb-3">
                      Root Admin can upload now to generate rubric draft, or attach later prior to evaluation.
                    </p>

                    {akFiles.length > 0 ? (
                      <div className="space-y-1.5 max-h-48 overflow-y-auto mb-3 pr-1">
                        {akFiles.map((f, idx) => {
                          const isPdf = f.name.toLowerCase().endsWith(".pdf");
                          return (
                            <div
                              key={`${f.name}-${idx}`}
                              className="flex items-center justify-between gap-2 bg-canvas-soft border border-hairline rounded-md px-2.5 py-1.5 text-xs"
                            >
                              <div className="flex items-center gap-2 truncate">
                                <span className="h-4 w-4 rounded-full bg-surface border border-hairline text-ink-muted flex items-center justify-center text-[10px] font-mono shrink-0">
                                  {idx + 1}
                                </span>
                                {isPdf ? (
                                  <FileCheck2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                                ) : (
                                  <ImageIcon className="h-3.5 w-3.5 text-ink-secondary shrink-0" />
                                )}
                                <span className="truncate text-ink font-medium">
                                  {f.name}
                                </span>
                                <span className="text-[11px] text-ink-muted shrink-0">
                                  ({formatFileSize(f.size)})
                                </span>
                              </div>
                              <button
                                type="button"
                                disabled={isSubmitting}
                                onClick={() => handleRemoveAkFile(idx)}
                                className="text-ink-muted hover:text-red-600 p-0.5 shrink-0 transition-colors cursor-pointer"
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
                        className="border border-dashed border-hairline rounded-md p-4 text-center my-2 cursor-pointer bg-surface hover:bg-canvas-soft transition-colors"
                      >
                        <Upload className="h-5 w-5 text-ink-muted mx-auto mb-1.5 shrink-0" />
                        <span className="text-xs text-ink font-medium block">
                          Click to browse or drop Answer Key
                        </span>
                        <span className="text-[11px] text-ink-muted">
                          PDF, JPG, PNG
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 mt-2 pt-3 border-t border-hairline">
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => {
                        if (!isSubmitting) akInputRef.current?.click();
                      }}
                      className="notion-btn-utility flex-1 justify-center text-xs"
                    >
                      <Plus className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                      <span>{akFiles.length === 0 ? "Select File(s)" : "Add More"}</span>
                    </button>
                    {akFiles.length > 0 && (
                      <button
                        type="button"
                        disabled={isSubmitting}
                        onClick={() => {
                          if (!isSubmitting) setAkFiles([]);
                        }}
                        className="notion-btn-danger justify-center text-xs"
                        title="Clear all answer key files"
                      >
                        <Trash2 className="h-3.5 w-3.5 shrink-0" />
                        <span>Clear</span>
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Governance notice for Branch Managers */}
            {!isRootAdmin && (
              <div className="flex items-center gap-3 p-3.5 rounded-lg bg-canvas-soft border border-hairline text-ink-muted text-xs">
                <div className="h-8 w-8 rounded-md bg-surface border border-hairline flex items-center justify-center shrink-0 text-primary">
                  <ShieldCheck className="h-4 w-4 shrink-0" />
                </div>
                <div className="leading-relaxed min-w-0">
                  <span className="font-semibold text-ink">Centralized Rubric Governance:</span> Official Answer Key upload and AI Rubric Synthesis are restricted to Root Administration. You can attach Question Papers now and open student submission windows immediately.
                </div>
              </div>
            )}

            {/* Extra Notes */}
            <div>
              <label className="text-xs font-semibold text-ink-secondary block mb-1.5">
                Teacher&apos;s Special Grading Instructions (Optional)
              </label>
              <textarea
                rows={3}
                disabled={isSubmitting}
                placeholder="e.g. Deduct 1 mark if SI units are omitted in numericals. Accept energy conservation alternatives..."
                value={extraNotes}
                onChange={(e) => setExtraNotes(e.target.value)}
                className="w-full rounded-xs border border-[#dddddd] dark:border-[#333333] bg-surface p-3 text-xs sm:text-sm text-ink placeholder:text-ink-faint focus:border-primary focus:outline-none transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="notion-btn-primary w-full justify-center py-2.5 text-sm font-medium disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                  <span>
                    {isSynthesizingRubric
                      ? `Synthesizing Rubric with Agent (${elapsedSeconds}s)...`
                      : "Creating Examination..."}
                  </span>
                </>
              ) : isSynthesizingRubric ? (
                <>
                  <Cpu className="h-4 w-4 shrink-0" />
                  <span>Create Exam &amp; Synthesize Rubric</span>
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 shrink-0" />
                  <span>Create Exam</span>
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
