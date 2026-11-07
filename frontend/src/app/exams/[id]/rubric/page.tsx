"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Upload, CheckCircle2, AlertCircle, FileText } from "lucide-react";
import { api, clearApiCache, getCached } from "@/lib/api";
import { Exam, ExamRubric } from "@/lib/types";
import { useSetBreadcrumbs } from "@/lib/BreadcrumbContext";
import { RubricEditor } from "@/components/RubricEditor";
import { ButtonPrimary, ButtonUtility, FeatureCard, BadgePill, RubricSkeleton } from "@/components/ui";
import { useToast } from "@/lib/ToastContext";
import { useTenant } from "@/lib/TenantContext";

export default function ExamRubricPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const { currentUser } = useTenant();
  const examId = params.id as string;

  const [exam, setExam] = useState<Exam | null>(() => {
    if (typeof window === "undefined" || !examId) return null;
    return getCached<Exam>(`exams:detail:${examId}`);
  });
  const [loading, setLoading] = useState<boolean>(() => {
    if (typeof window === "undefined" || !examId) return true;
    return !getCached<Exam>(`exams:detail:${examId}`);
  });

  // Safety fallback: ensure skeleton never hangs indefinitely
  useEffect(() => {
    if (!loading) return;
    const fallbackTimer = setTimeout(() => {
      setLoading(false);
    }, 4000);
    return () => clearTimeout(fallbackTimer);
  }, [loading]);

  useSetBreadcrumbs(
    exam
      ? {
          group: "Academic Operations",
          segments: [
            { label: "Exams & Rubrics", href: "/exams" },
            { label: exam.title, href: `/exams/${exam.id}` },
            { label: "Rubric Editor" },
          ],
        }
      : null,
    [exam]
  );

  useEffect(() => {
    loadExam();
  }, [examId]);

  const loadExam = async () => {
    try {
      const data = await api.getExam(examId, true);
      setExam(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (approvedRubric: ExamRubric) => {
    try {
      const updatedExam = await api.approveRubric(examId, approvedRubric);
      clearApiCache(`exams:detail:${examId}`);
      if (updatedExam && updatedExam.id && updatedExam.rubric_version) {
        setExam(updatedExam);
      } else {
        await loadExam();
      }
      toast.success("Rubric approved & locked! Ingestion of student answer sheets is now open.", { title: "Rubric Approved" });
    } catch (err: any) {
      toast.error(err.message || "Failed to approve rubric", { title: "Approval Failed" });
    }
  };

  const handleUnlock = async () => {
    try {
      const updatedExam = await api.unlockRubric(examId);
      clearApiCache(`exams:detail:${examId}`);
      if (updatedExam && updatedExam.id && updatedExam.rubric_version) {
        setExam(updatedExam);
      } else {
        await loadExam();
      }
      toast.info("Rubric unlocked for criteria and structure modifications.", { title: "Rubric Unlocked" });
    } catch (err: any) {
      toast.error(err.message || "Failed to unlock rubric", { title: "Unlock Failed" });
    }
  };

  if (loading) {
    return <RubricSkeleton />;
  }

  if (!exam) {
    return (
      <div className="max-w-xl mx-auto py-12">
        <FeatureCard className="p-8 text-center space-y-4">
          <div className="mx-auto h-10 w-10 rounded-full bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/40 flex items-center justify-center text-red-600 dark:text-red-400">
            <AlertCircle className="h-5 w-5" />
          </div>
          <h2 className="text-base font-bold text-ink">Examination Not Found</h2>
          <p className="text-xs text-ink-muted">
            The requested examination could not be located in the academic registry.
          </p>
          <div className="pt-2">
            <ButtonUtility href="/exams">
              <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
              Return to Examinations
            </ButtonUtility>
          </div>
        </FeatureCard>
      </div>
    );
  }

  let rubricData: ExamRubric = {
    exam_title: exam.title || "Examination Rubric",
    subject: exam.subject || "",
    total_marks: exam.total_marks || 20,
    questions: [],
    sections: [],
  };

  if (exam.rubric_version?.rubric_data) {
    try {
      const raw = exam.rubric_version.rubric_data;
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (parsed && typeof parsed === "object") {
        rubricData = {
          ...parsed,
          exam_title: parsed.exam_title || exam.title,
          subject: parsed.subject || exam.subject,
          total_marks: parsed.total_marks || exam.total_marks || 20,
          questions: Array.isArray(parsed.questions)
            ? parsed.questions.map((q: any, idx: number) => ({
                ...q,
                question_id: q.question_id || String(idx + 1),
                question_text: q.question_text || q.title || "",
                max_marks: Number(q.max_marks) || 0,
                official_answer: q.official_answer || "",
                criteria: Array.isArray(q.criteria)
                  ? q.criteria.map((c: any, cIdx: number) => ({
                      ...c,
                      criterion_id: c.criterion_id || `C${cIdx + 1}`,
                      description: c.description || "",
                      marks: Number(c.marks) || 0,
                    }))
                  : [],
              }))
            : [],
          sections: Array.isArray(parsed.sections) ? parsed.sections : [],
        };
      }
    } catch (e) {
      console.error("Failed to parse rubric data:", e);
    }
  }

  const isApproved = Boolean(exam.rubric_version?.is_approved);
  const hasQuestions = Boolean(rubricData.questions && rubricData.questions.length > 0);
  const showNoKeyBanner = !exam.answer_key_path && !hasQuestions;

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {showNoKeyBanner && (
        <div className="rounded-lg border border-amber-200 dark:border-amber-800/40 bg-amber-50 dark:bg-amber-950/30 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-900 dark:text-amber-200 shadow-2xs">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <span>
              <strong>Answer Key not yet uploaded:</strong>{" "}
              {currentUser?.role === "ROOT_ADMIN"
                ? "You can edit criteria manually below, or upload the Official Answer Key on the exam page to draft questions via Gemini Vision AI."
                : "A Root Admin must upload the Official Answer Key on the exam page to draft questions via Gemini Vision AI. You can review or manually edit criteria below."}
            </span>
          </div>
          <ButtonUtility href={`/exams/${examId}`} className="shrink-0 self-start sm:self-auto bg-surface">
            {currentUser?.role === "ROOT_ADMIN" ? "Upload Key on Exam Page →" : "View Exam Page →"}
          </ButtonUtility>
        </div>
      )}

      {isApproved && (
        <div className="flex items-center justify-end pb-2 border-b border-hairline">
          <ButtonPrimary href={`/branch/batches`} className="self-start sm:self-auto">
            <Upload className="h-4 w-4 mr-2" />
            Proceed to Batches & Submissions →
          </ButtonPrimary>
        </div>
      )}

      <RubricEditor
        key={`${exam.id}_${exam.rubric_version?.id || "draft"}_${isApproved ? "locked" : "unlocked"}`}
        initialRubric={rubricData}
        isApproved={isApproved}
        onApprove={handleApprove}
        onUnlock={handleUnlock}
      />
    </div>
  );
}
