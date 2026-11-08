"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Flag,
  ExternalLink,
  ArrowUpDown,
  FileSpreadsheet,
  Lock,
} from "lucide-react";
import { Submission, ExamRubric } from "@/lib/types";
import { api } from "@/lib/api";
import { BadgePill } from "./ui";
import { useToast } from "@/lib/ToastContext";

interface MarksTableProps {
  examId: string;
  rubric?: ExamRubric;
  submissions: Submission[];
}

export function MarksTable({ examId, rubric, submissions }: MarksTableProps) {
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

  return (
    <div className="rounded-lg border border-hairline bg-surface shadow-2xs overflow-hidden">
      {/* Header Controls */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-4 border-b border-hairline bg-canvas-soft">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full sm:w-auto">
          {/* Search */}
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-ink-muted" />
            <input
              type="text"
              placeholder="Search student or roll no..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-md border border-hairline bg-surface pl-9 pr-3 py-1.5 text-xs text-ink placeholder:text-ink-muted focus:border-primary focus:outline-none shadow-2xs"
            />
          </div>

          {/* Filter */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="w-full sm:w-auto rounded-md border border-hairline bg-surface px-3 py-1.5 text-xs font-medium text-ink focus:border-primary focus:outline-none shadow-2xs"
          >
            <option value="ALL">All Candidates ({submissions.length})</option>
            <option value="COMPLETED">Finalized / Completed</option>
            <option value="REVIEW">Needs Review</option>
            <option value="ABSENT">Absent ({submissions.filter((s) => s.status === "ABSENT" || (s as any).is_absent).length})</option>
          </select>
        </div>

        {/* CSV Export */}
        <a
          href={api.getMarksCsvUrl(examId, "Examination_Marks_Summary.csv")}
          download="Examination_Marks_Summary.csv"
          onClick={() => toast.info("Exporting class marks matrix CSV...", { title: "CSV Export" })}
          className="btn-glass-utility inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold text-ink transition-all self-stretch sm:self-auto cursor-pointer"
        >
          <FileSpreadsheet className="h-3.5 w-3.5 text-[#1e613b] dark:text-[#86d4a4]" />
          <span>Export Marks (CSV)</span>
        </a>
      </div>

      {/* Spreadsheet Matrix Table */}
      <div className="overflow-x-auto sleek-scrollbar">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-hairline bg-canvas-soft text-[11px] font-bold text-ink-secondary uppercase tracking-wider">
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
                    <td className="px-4 py-3 font-mono font-bold text-ink whitespace-nowrap">
                      {sub.roll_number}
                    </td>
                    <td className="px-4 py-3 font-medium text-ink whitespace-nowrap">
                      {sub.student_name}
                      {Boolean(sub.is_manual_override) && (
                        <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[#faf4ec] text-[#7a4e18] border border-[#e8dac5] dark:bg-[#241a10] dark:text-[#e5ad68] dark:border-[#422c17]">
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
                          className="px-3 py-3 text-center font-mono text-xs whitespace-nowrap"
                        >
                          {ans.needs_review ? (
                            <span className="inline-flex px-1.5 py-0.5 rounded font-bold text-[#553578] dark:text-[#bf9fe3] bg-[#f4f0f8] dark:bg-[#1f162a] border border-[#dcd0ea] dark:border-[#38264e]">
                              {ans.awarded_marks}
                            </span>
                          ) : ans.awarded_marks >= ans.max_marks ? (
                            <span className="font-bold text-[#1e613b] dark:text-[#86d4a4]">
                              {ans.awarded_marks}
                            </span>
                          ) : ans.awarded_marks > 0 ? (
                            <span className="font-semibold text-[#7a4e18] dark:text-[#e5ad68]">
                              {ans.awarded_marks}
                            </span>
                          ) : (
                            <span className="text-[#872323] dark:text-[#e87878] font-medium">
                              {ans.awarded_marks}
                            </span>
                          )}
                        </td>
                      );
                    })}

                    <td className="px-4 py-3 text-right font-mono font-bold text-ink whitespace-nowrap">
                      {sub.total_awarded_marks}{" "}
                      <span className="text-ink-muted font-normal text-[11px]">/ {sub.max_marks}</span>
                    </td>
                    <td className="px-3 py-3 text-right font-mono font-bold text-primary whitespace-nowrap">
                      {sub.percentage}%
                    </td>
                    <td className="px-4 py-3 text-center whitespace-nowrap">
                      {sub.status === "ABSENT" || (sub as any).is_absent ? (
                        <BadgePill label="Absent" color="red" />
                      ) : hasReview ? (
                        <BadgePill label="Review" color="purple" />
                      ) : sub.status === "COMPLETED" ? (
                        <BadgePill label="Completed" color="green" />
                      ) : (
                        <BadgePill label={sub.status} color="gray" />
                      )}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {sub.status === "ABSENT" || (sub as any).is_absent ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold text-[#872323] bg-[#fbf0f0] border border-[#ecd0d0] dark:bg-[#261212] dark:text-[#e87878] dark:border-[#491f1f]">
                          No Submission
                        </span>
                      ) : Boolean(
                        sub.status &&
                          ["COMPLETED", "GRADED", "NEEDS_REVIEW", "FAILED"].includes(
                            sub.status.toUpperCase()
                          )
                      ) ? (
                        <Link
                          href={`/grading/${sub.id}`}
                          className="btn-glass-utility inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold text-primary transition-all"
                        >
                          <span>Inspect Paper</span>
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      ) : (
                        <span
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-ink-muted opacity-45 bg-canvas-soft/40 border border-hairline/60 cursor-not-allowed select-none"
                          title="Evaluation in progress. Paper inspection is disabled until status changes to completed or failed."
                        >
                          <Lock className="h-3 w-3 text-ink-muted/70" />
                          <span>Inspect Paper</span>
                        </span>
                      )}
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
