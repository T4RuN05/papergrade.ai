"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Search,
  ArrowRight,
  ArrowUpDown,
  FileSpreadsheet,
  Lock,
} from "lucide-react";
import { Submission, ExamRubric } from "@/lib/types";
import { api } from "@/lib/api";
import { AppleSelect } from "./ui";
import { useToast } from "@/lib/ToastContext";

interface MarksTableProps {
  examId: string;
  rubric?: ExamRubric;
  submissions: Submission[];
  isFetching?: boolean;
}

export function MarksTable({ examId, rubric, submissions, isFetching = false }: MarksTableProps) {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("ALL");
  const [sortField, setSortField] = useState<string>("roll_number");
  const [sortAsc, setSortAsc] = useState<boolean>(true);

  const questions = (rubric?.questions || []).map((q) => q.question_id);

  const filtered = submissions
    .filter((sub) => {
      const q = search.toLowerCase();
      const matchSearch =
        sub.student_name.toLowerCase().includes(q) ||
        sub.roll_number.toLowerCase().includes(q);
      if (filterStatus === "REVIEW") {
        return matchSearch && (sub.status === "NEEDS_REVIEW" || (sub.answers || []).some((a) => a.needs_review));
      }
      if (filterStatus === "COMPLETED") {
        return matchSearch && sub.status === "COMPLETED";
      }
      if (filterStatus === "ABSENT") {
        return matchSearch && (sub.status === "ABSENT" || Boolean((sub as any).is_absent));
      }
      return matchSearch;
    })
    .sort((a, b) => {
      let valA: any = a[sortField as keyof Submission];
      let valB: any = b[sortField as keyof Submission];
      if (valA === undefined) valA = "";
      if (valB === undefined) valB = "";
      if (typeof valA === "string") {
        return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return sortAsc ? valA - valB : valB - valA;
    });

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  const renderStatusPill = (sub: Submission, hasReview: boolean) => {
    const statusUpper = (sub.status || "").toUpperCase();
    const isAbsent = statusUpper === "ABSENT" || Boolean((sub as any).is_absent);
    const isProcessing = ["QUEUED", "PROCESSING", "EVALUATING"].includes(statusUpper);
    const isUploaded = statusUpper === "UPLOADED" || statusUpper === "PENDING";

    let dot = "bg-ink-muted";
    let label = sub.status || "Pending";
    if (isAbsent) {
      dot = "bg-[#c93b3b]";
      label = "Absent";
    } else if (isProcessing) {
      dot = "bg-[#dd5b00]";
      label = "Evaluating";
    } else if (isUploaded) {
      dot = "bg-primary";
      label = "Uploaded";
    } else if (hasReview) {
      dot = "bg-[#8b5cf6]";
      label = "Review";
    } else if (statusUpper === "COMPLETED" || statusUpper === "GRADED") {
      dot = "bg-[#1aae39]";
      label = "Completed";
    }

    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-xs text-[11px] font-medium bg-canvas-soft border border-hairline text-ink-secondary whitespace-nowrap">
        <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${dot}`} />
        <span>{label}</span>
      </span>
    );
  };

  return (
    <div className="notion-card overflow-hidden">
      {/* Header Controls */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-4 border-b border-hairline bg-canvas-soft">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full sm:w-auto">
          {/* Search */}
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-muted pointer-events-none" />
            <input
              type="text"
              placeholder="Search student or roll no..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xs border border-hairline bg-surface pl-9 pr-3 py-1.5 text-xs text-ink placeholder:text-ink-faint focus:border-primary focus:outline-none"
            />
          </div>

          {/* Filter Dropdown */}
          <AppleSelect
            size="sm"
            value={filterStatus}
            onChange={(val: any) => setFilterStatus(val)}
            options={[
              { value: "ALL", label: `All Candidates (${submissions.length})` },
              { value: "COMPLETED", label: "Finalized / Completed" },
              { value: "REVIEW", label: "Needs Review" },
              { value: "ABSENT", label: `Absent (${submissions.filter((s) => s.status === "ABSENT" || (s as any).is_absent).length})` },
            ]}
            className="w-full sm:w-auto"
          />
        </div>

        {/* CSV Export */}
        <a
          href={api.getMarksCsvUrl(examId, "Examination_Marks_Summary.csv")}
          download="Examination_Marks_Summary.csv"
          onClick={() => toast.info("Exporting class marks matrix CSV...", { title: "CSV Export" })}
          className="notion-btn-utility w-full sm:w-auto"
        >
          <FileSpreadsheet className="h-3.5 w-3.5 text-[#1aae39]" />
          <span>Export Marks (CSV)</span>
        </a>
      </div>

      {/* Refetch progress hairline */}
      {isFetching && (
        <div className="h-0.5 w-full bg-hairline overflow-hidden">
          <div className="h-full bg-primary w-2/5 transition-transform" />
        </div>
      )}

      {/* Mobile Card List (< 640px) */}
      <div className={`sm:hidden divide-y divide-hairline transition-opacity duration-200 ${isFetching ? "opacity-60 pointer-events-none" : "opacity-100"}`}>
        {filtered.length === 0 ? (
          <div className="px-4 py-10 text-center text-xs text-ink-muted">
            No student submissions found matching current criteria.
          </div>
        ) : (
          filtered.map((sub) => {
            const answerMap = new Map((sub.answers || []).map((a) => [a.question_id, a]));
            const hasReview =
              sub.status === "NEEDS_REVIEW" ||
              (sub.answers || []).some((a) => a.needs_review);
            const statusUpper = (sub.status || "").toUpperCase();
            const isAbsent = statusUpper === "ABSENT" || Boolean((sub as any).is_absent);
            const isProcessing = ["QUEUED", "PROCESSING", "EVALUATING"].includes(statusUpper);

            return (
              <div key={sub.id} className="p-3.5 space-y-2.5 bg-surface">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-semibold text-sm text-ink truncate">
                        {sub.student_name}
                      </span>
                      {Boolean(sub.is_manual_override) && (
                        <span className="px-1.5 py-0.5 rounded-xs text-[10px] font-medium bg-canvas-soft text-ink-secondary border border-hairline">
                          Edited
                        </span>
                      )}
                    </div>
                    <div className="text-xs font-mono text-ink-muted mt-0.5">
                      Roll: {sub.roll_number}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-mono font-bold text-sm text-ink tabular-nums">
                      {sub.total_awarded_marks}
                      <span className="text-ink-muted font-normal text-xs">/{sub.max_marks}</span>
                    </div>
                    <div className="font-mono text-xs font-semibold text-primary tabular-nums">
                      {sub.percentage}%
                    </div>
                  </div>
                </div>

                {questions.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {questions.map((qid) => {
                      const ans = answerMap.get(qid);
                      return (
                        <span
                          key={qid}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-xs bg-canvas-soft border border-hairline text-[11px] font-mono tabular-nums"
                        >
                          <span className="text-ink-muted">{qid}:</span>
                          <span
                            className={`font-semibold ${
                              !ans
                                ? "text-ink-faint"
                                : ans.needs_review
                                ? "text-[#8b5cf6]"
                                : ans.awarded_marks >= ans.max_marks
                                ? "text-[#1aae39]"
                                : ans.awarded_marks > 0
                                ? "text-[#dd5b00]"
                                : "text-[#c93b3b]"
                            }`}
                          >
                            {ans ? ans.awarded_marks : "—"}
                          </span>
                        </span>
                      );
                    })}
                  </div>
                )}

                <div className="flex items-center justify-between gap-2 pt-2 border-t border-hairline">
                  {renderStatusPill(sub, hasReview)}
                  {isAbsent ? (
                    <span className="text-xs font-medium text-[#c93b3b]">No Submission</span>
                  ) : isProcessing ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-ink-muted opacity-60">
                      <Lock className="h-3 w-3" />
                      <span>Evaluating</span>
                    </span>
                  ) : (
                    <Link
                      href={`/grading/${sub.id}`}
                      className="notion-btn-utility min-h-0 h-7 px-2.5 text-primary"
                    >
                      <span>Inspect Sheet</span>
                      <ArrowRight className="h-3 w-3 shrink-0" />
                    </Link>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Desktop Spreadsheet Matrix Table (>= 640px) */}
      <div className={`hidden sm:block overflow-x-auto sleek-scrollbar transition-opacity duration-200 ${isFetching ? "opacity-60 pointer-events-none" : "opacity-100"}`}>
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-hairline bg-canvas-soft notion-eyebrow text-ink-muted">
              <th
                onClick={() => handleSort("roll_number")}
                className="cursor-pointer px-4 py-3 hover:text-ink transition-colors whitespace-nowrap"
              >
                <div className="flex items-center gap-1.5">
                  Roll No
                  <ArrowUpDown className="h-3 w-3 text-ink-muted" />
                </div>
              </th>
              <th
                onClick={() => handleSort("student_name")}
                className="cursor-pointer px-4 py-3 hover:text-ink transition-colors whitespace-nowrap"
              >
                <div className="flex items-center gap-1.5">
                  Student Name
                  <ArrowUpDown className="h-3 w-3 text-ink-muted" />
                </div>
              </th>

              {/* Dynamic Question Columns */}
              {questions.map((qid) => (
                <th key={qid} className="px-3 py-3 font-semibold text-center font-mono whitespace-nowrap">
                  {qid}
                </th>
              ))}

              <th
                onClick={() => handleSort("total_awarded_marks")}
                className="cursor-pointer px-4 py-3 hover:text-ink transition-colors text-right whitespace-nowrap"
              >
                <div className="flex items-center justify-end gap-1.5">
                  Total
                  <ArrowUpDown className="h-3 w-3 text-ink-muted" />
                </div>
              </th>
              <th
                onClick={() => handleSort("percentage")}
                className="cursor-pointer px-3 py-3 hover:text-ink transition-colors text-right whitespace-nowrap"
              >
                %
              </th>
              <th className="px-4 py-3 text-center whitespace-nowrap">Status</th>
              <th className="px-4 py-3 text-right whitespace-nowrap">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={questions.length + 6}
                  className="px-6 py-12 text-center text-xs text-ink-muted"
                >
                  No student submissions found matching current criteria.
                </td>
              </tr>
            ) : (
              filtered.map((sub) => {
                const answerMap = new Map((sub.answers || []).map((a) => [a.question_id, a]));
                const hasReview =
                  sub.status === "NEEDS_REVIEW" ||
                  (sub.answers || []).some((a) => a.needs_review);

                return (
                  <tr
                    key={sub.id}
                    className="hover:bg-canvas-soft/60 transition-colors"
                  >
                    <td className="px-4 py-3 font-mono font-semibold text-ink whitespace-nowrap">
                      {sub.roll_number}
                    </td>
                    <td className="px-4 py-3 font-medium text-ink whitespace-nowrap">
                      {sub.student_name}
                      {Boolean(sub.is_manual_override) && (
                        <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded-xs text-[10px] font-medium bg-canvas-soft text-ink-secondary border border-hairline">
                          Edited
                        </span>
                      )}
                    </td>

                    {/* Question scores */}
                    {questions.map((qid) => {
                      const ans = answerMap.get(qid);
                      if (!ans) {
                        return (
                          <td key={qid} className="px-3 py-3 text-center text-ink-faint font-mono">
                            —
                          </td>
                        );
                      }
                      return (
                        <td
                          key={qid}
                          className="px-3 py-3 text-center font-mono text-xs whitespace-nowrap tabular-nums"
                        >
                          {ans.needs_review ? (
                            <span className="inline-flex px-1.5 py-0.5 rounded-xs font-semibold text-[#8b5cf6] bg-canvas-soft border border-hairline">
                              {ans.awarded_marks}
                            </span>
                          ) : ans.awarded_marks >= ans.max_marks ? (
                            <span className="font-semibold text-[#1aae39]">
                              {ans.awarded_marks}
                            </span>
                          ) : ans.awarded_marks > 0 ? (
                            <span className="font-medium text-[#dd5b00]">
                              {ans.awarded_marks}
                            </span>
                          ) : (
                            <span className="text-[#c93b3b] font-medium">
                              {ans.awarded_marks}
                            </span>
                          )}
                        </td>
                      );
                    })}

                    <td className="px-4 py-3 text-right font-mono font-bold text-ink whitespace-nowrap tabular-nums">
                      {sub.total_awarded_marks}{" "}
                      <span className="text-ink-muted font-normal text-[11px]">/ {sub.max_marks}</span>
                    </td>
                    <td className="px-3 py-3 text-right font-mono font-semibold text-primary whitespace-nowrap tabular-nums">
                      {sub.percentage}%
                    </td>
                    <td className="px-4 py-3 text-center whitespace-nowrap">
                      {renderStatusPill(sub, hasReview)}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {(() => {
                        const statusUpper = (sub.status || "").toUpperCase();
                        const isAbsent = statusUpper === "ABSENT" || Boolean((sub as any).is_absent);
                        const isProcessing = ["QUEUED", "PROCESSING", "EVALUATING"].includes(statusUpper);

                        if (isAbsent) {
                          return (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-xs text-[11px] font-medium text-[#c93b3b] bg-canvas-soft border border-hairline">
                              No Submission
                            </span>
                          );
                        }

                        if (isProcessing) {
                          return (
                            <span
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-ink-muted opacity-50 bg-canvas-soft border border-hairline cursor-not-allowed select-none"
                              title="Evaluation in progress. Sheet inspection will unlock automatically once completed."
                            >
                              <Lock className="h-3 w-3 text-ink-muted" />
                              <span>Inspect Sheet</span>
                            </span>
                          );
                        }

                        return (
                          <Link
                            href={`/grading/${sub.id}`}
                            className="notion-btn-utility min-h-0 h-7 px-2.5 text-primary"
                          >
                            <span>Inspect Sheet</span>
                            <ArrowRight className="h-3 w-3 shrink-0" />
                          </Link>
                        );
                      })()}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
