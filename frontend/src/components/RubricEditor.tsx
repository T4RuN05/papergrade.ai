"use client";

import React, { useState, useEffect } from "react";
import { Plus } from "lucide-react";
import { ExamRubric, RubricQuestion, RubricCriterion } from "@/lib/types";
import { FeatureCard } from "./ui";
import { useToast } from "@/lib/ToastContext";
import { RubricHeaderToolbar } from "./rubric/RubricHeaderToolbar";
import { RubricSectionsCard } from "./rubric/RubricSectionsCard";
import { RubricQuestionCard } from "./rubric/RubricQuestionCard";

interface RubricEditorProps {
  initialRubric: ExamRubric;
  isApproved: boolean;
  onApprove: (approvedRubric: ExamRubric) => Promise<void>;
  onUnlock?: () => Promise<void>;
}

const normalizeQuestion = (q: RubricQuestion, idx: number): RubricQuestion => ({
  ...q,
  question_id: q.question_id || String(idx + 1),
  question_text: q.question_text || (q as any).title || "",
  max_marks: Number(q.max_marks) || 0,
  official_answer: q.official_answer || "",
  criteria: Array.isArray(q.criteria)
    ? q.criteria.map((c, cIdx) => ({
        ...c,
        criterion_id: c.criterion_id || `C${cIdx + 1}`,
        description: c.description || "",
        marks: Number(c.marks) || 0,
      }))
    : [],
});

const normalizeRubric = (r?: ExamRubric): ExamRubric => {
  if (!r) {
    return {
      exam_title: "",
      subject: "",
      total_marks: 0,
      questions: [],
      sections: [],
    };
  }
  return {
    ...r,
    exam_title: r.exam_title || "",
    subject: r.subject || "",
    total_marks: Number(r.total_marks) || 0,
    questions: Array.isArray(r.questions)
      ? r.questions.map((q, i) => normalizeQuestion(q, i))
      : [],
    sections: Array.isArray(r.sections) ? r.sections : [],
  };
};

export function RubricEditor({
  initialRubric,
  isApproved,
  onApprove,
  onUnlock,
}: RubricEditorProps) {
  const { toast } = useToast();
  const [rubric, setRubric] = useState<ExamRubric>(() => normalizeRubric(initialRubric));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUnlocking, setIsUnlocking] = useState(false);

  useEffect(() => {
    setRubric(normalizeRubric(initialRubric));
  }, [initialRubric]);

  const calculateTotalMarks = () => {
    if (rubric.sections && rubric.sections.length > 0) {
      const secSum = rubric.sections.reduce((acc, s) => acc + (Number(s.max_marks) || 0), 0);
      if (secSum > 0) return secSum;
    }
    if (rubric.total_marks && Number(rubric.total_marks) > 0) {
      return Number(rubric.total_marks);
    }
    return (rubric.questions || []).reduce((sum, q) => sum + (Number(q.max_marks) || 0), 0);
  };

  const handleQuestionChange = (index: number, field: keyof RubricQuestion, value: any) => {
    const updatedQuestions = [...(rubric.questions || [])];
    updatedQuestions[index] = { ...updatedQuestions[index], [field]: value };
    setRubric({ ...rubric, questions: updatedQuestions });
  };

  const handleAddQuestion = () => {
    const questions = rubric.questions || [];
    const nextQId = `Q${questions.length + 1}`;
    const newQ: RubricQuestion = {
      question_id: nextQId,
      question_text: "New Question Statement...",
      max_marks: 4.0,
      official_answer: "Official expected solution / model answer...",
      criteria: [
        {
          criterion_id: "C1",
          description: "Stated valid approach or formula",
          marks: 2.0,
        },
        {
          criterion_id: "C2",
          description: "Correct final calculation and units",
          marks: 2.0,
        },
      ],
    };
    setRubric({
      ...rubric,
      questions: [...questions, newQ],
    });
  };

  const handleDeleteQuestion = (index: number) => {
    const updated = (rubric.questions || []).filter((_, i) => i !== index);
    setRubric({ ...rubric, questions: updated });
  };

  const handleAddCriterion = (qIndex: number) => {
    const q = rubric.questions[qIndex];
    const crits = Array.isArray(q?.criteria) ? q.criteria : [];
    const nextCId = `C${crits.length + 1}`;
    const newCrit: RubricCriterion = {
      criterion_id: nextCId,
      description: "Criterion step description...",
      marks: 1.0,
    };
    handleQuestionChange(qIndex, "criteria", [...crits, newCrit]);
  };

  const handleDeleteCriterion = (qIndex: number, cIndex: number) => {
    const q = rubric.questions[qIndex];
    const crits = Array.isArray(q?.criteria) ? q.criteria : [];
    const updated = crits.filter((_, i) => i !== cIndex);
    handleQuestionChange(qIndex, "criteria", updated);
  };

  const handleCriterionFieldChange = (
    qIndex: number,
    cIndex: number,
    field: keyof RubricCriterion,
    value: any
  ) => {
    const q = rubric.questions[qIndex];
    const crits = Array.isArray(q?.criteria) ? q.criteria : [];
    const updatedCrits = [...crits];
    updatedCrits[cIndex] = { ...updatedCrits[cIndex], [field]: value };
    handleQuestionChange(qIndex, "criteria", updatedCrits);
  };

  const handleApproveClick = async () => {
    setIsSubmitting(true);
    try {
      const finalRubric = {
        ...rubric,
        total_marks: calculateTotalMarks(),
      };
      await onApprove(finalRubric);
    } catch (e: any) {
      toast.error(e.message || "Approval failed", { title: "Approval Failed" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUnlockClick = async () => {
    if (!onUnlock) return;
    setIsUnlocking(true);
    try {
      await onUnlock();
    } catch (e: any) {
      toast.error(e.message || "Unlock failed", { title: "Unlock Failed" });
    } finally {
      setIsUnlocking(false);
    }
  };

  const isReadOnly = isApproved || isSubmitting;
  const total = calculateTotalMarks();

  return (
    <div className="space-y-6">
      <FeatureCard className="p-6 space-y-6">
        {/* Header Toolbar */}
        <RubricHeaderToolbar
          examTitle={rubric.exam_title}
          subject={rubric.subject}
          questionCount={rubric.questions.length}
          totalMarks={total}
          isApproved={isApproved}
          isSubmitting={isSubmitting}
          isUnlocking={isUnlocking}
          onApprove={handleApproveClick}
          onUnlock={onUnlock ? handleUnlockClick : undefined}
        />

        {/* Sections Breakdown Banner */}
        <RubricSectionsCard
          sections={rubric.sections}
          paperCapMarks={total}
        />

        {/* Questions List */}
        <div className="space-y-5">
          {(rubric.questions || []).map((q, qIdx) => (
            <RubricQuestionCard
              key={qIdx}
              question={q}
              qIdx={qIdx}
              isReadOnly={isReadOnly}
              onQuestionChange={handleQuestionChange}
              onDeleteQuestion={handleDeleteQuestion}
              onAddCriterion={handleAddCriterion}
              onDeleteCriterion={handleDeleteCriterion}
              onCriterionFieldChange={handleCriterionFieldChange}
            />
          ))}

          {!isReadOnly && (
            <button
              type="button"
              onClick={handleAddQuestion}
              className="w-full flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-hairline bg-canvas-soft/40 hover:bg-canvas-soft hover:border-primary p-4 text-xs font-semibold text-ink-secondary hover:text-primary transition-all cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              Add Another Question to Rubric
            </button>
          )}
        </div>
      </FeatureCard>
    </div>
  );
}
