"use client";

import React, { useMemo } from "react";
import {
  Users,
  Plus,
  FileSpreadsheet,
  Trash2,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import { Skeleton } from "@/components/ui";

interface StudentItem {
  id: string;
  roll_number?: string;
  full_name?: string;
  student_name?: string;
  account_claimed?: boolean | number;
  student_id_num?: string;
}

interface BatchRosterTableProps {
  selectedBatch: any;
  students: StudentItem[];
  loadingStudents: boolean;
  studentSearch: string;
  onSearchChange: (search: string) => void;
  onAddStudentClick: () => void;
  onImportRosterClick: () => void;
  onDeleteBatchClick: () => void;
  onDeleteStudent: (studentId: string, studentName: string) => void;
}

export function BatchRosterTable({
  selectedBatch,
  students,
  loadingStudents,
  studentSearch,
  onSearchChange,
  onAddStudentClick,
  onImportRosterClick,
  onDeleteBatchClick,
  onDeleteStudent,
}: BatchRosterTableProps) {
  const filteredStudents = useMemo(() => {
    if (!studentSearch.trim()) return students;
    const q = studentSearch.toLowerCase();
    return students.filter(
      (s) =>
        s.student_name?.toLowerCase().includes(q) ||
        s.full_name?.toLowerCase().includes(q) ||
        s.roll_number?.toLowerCase().includes(q) ||
        (!s.account_claimed && s.student_id_num?.includes(q))
    );
  }, [students, studentSearch]);

  const claimedCount = useMemo(() => {
    return students.filter((s) => s.account_claimed).length;
  }, [students]);

  if (!selectedBatch) {
    return (
      <div className="notion-card rounded-lg p-8 sm:p-12 text-center text-xs text-ink-muted space-y-2">
        <Users className="h-8 w-8 text-ink-faint mx-auto" />
        <p className="font-semibold text-ink">
          Select a batch from the list to view and manage its student roster.
        </p>
        <p className="text-xs">Or create a new batch to get started.</p>
      </div>
    );
  }

  return (
    <div className="notion-card rounded-lg p-4 sm:p-6 space-y-4">
      {/* Batch Action Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-hairline">
        <div className="min-w-0">
          <h3 className="notion-heading-3 text-base sm:text-lg text-ink truncate">
            {selectedBatch.name}
          </h3>
          <p className="text-xs text-ink-muted mt-0.5">
            Academic Year:{" "}
            <span className="font-medium text-ink tabular-nums">
              {selectedBatch.academic_year || "2026"}
            </span>
          </p>
        </div>

        <div className="grid grid-cols-2 [&>*:last-child:nth-child(odd)]:col-span-2 sm:flex sm:items-center gap-2 w-full sm:w-auto shrink-0">
          <button
            type="button"
            onClick={onAddStudentClick}
            className="notion-btn-utility justify-center text-xs"
            title="Add Student"
          >
            <Plus className="h-3.5 w-3.5 text-primary shrink-0" />
            <span>Add Student</span>
          </button>

          <button
            type="button"
            onClick={onImportRosterClick}
            className="notion-btn-utility justify-center text-xs"
            title="Import Excel Roster"
          >
            <FileSpreadsheet className="h-3.5 w-3.5 text-ink-secondary shrink-0" />
            <span>Import Excel</span>
          </button>

          <button
            type="button"
            onClick={onDeleteBatchClick}
            title="Delete batch"
            className="notion-btn-danger justify-center text-xs px-3"
          >
            <Trash2 className="h-3.5 w-3.5 shrink-0" />
            <span className="sm:hidden">Delete Batch</span>
          </button>
        </div>
      </div>

      {/* Roster Onboarding Notice */}
      <div className="p-3.5 rounded-lg bg-canvas-soft border border-hairline text-xs text-ink-secondary space-y-1">
        <div className="font-semibold text-ink flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary shrink-0" />
          <span>Student Onboarding &amp; Account Activation</span>
        </div>
        <p className="text-xs text-ink-muted leading-relaxed">
          Students activate their PWA account at{" "}
          <code className="font-mono font-medium text-ink bg-surface px-1.5 py-0.5 rounded-xs border border-hairline">
            /auth/claim
          </code>{" "}
          or the student portal using their assigned Roll Number to set their password.
        </p>
      </div>

      {/* Table Controls (Search & Stats) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3">
        <div className="relative flex-1 w-full sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-muted pointer-events-none" />
          <input
            type="text"
            placeholder="Search name or roll no..."
            value={studentSearch}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full rounded-xs border border-[#dddddd] dark:border-[#333333] bg-surface pl-9 pr-8 py-2 text-xs text-ink placeholder:text-ink-faint focus:border-primary focus:outline-none transition-colors"
          />
          {studentSearch && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-ink-muted hover:text-ink rounded-xs cursor-pointer"
              title="Clear search"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-2 text-xs text-ink-muted font-medium tabular-nums">
          <span>
            {filteredStudents.length}{" "}
            {filteredStudents.length === 1 ? "student" : "students"}
          </span>
          <span className="text-ink-faint">•</span>
          <span className="text-ink-secondary">
            {claimedCount} claimed
          </span>
        </div>
      </div>

      {/* Student Roster Table & Mobile Card View */}
      <div className="rounded-lg border border-hairline overflow-hidden bg-surface">
        {/* Mobile View (< sm): Touch-friendly student cards */}
        <div className="sm:hidden divide-y divide-hairline max-h-[480px] overflow-y-auto">
          {loadingStudents ? (
            [1, 2, 3, 4].map((i) => (
              <div key={i} className="p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-3.5 w-24" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
                <Skeleton className="h-3 w-40" />
              </div>
            ))
          ) : filteredStudents.length === 0 ? (
            <div className="px-4 py-10 text-center text-ink-muted space-y-1">
              <p className="text-xs font-semibold text-ink">No students found.</p>
              <p className="text-xs">
                {studentSearch
                  ? "No matches for your search query."
                  : "Add students manually or import an Excel roster."}
              </p>
            </div>
          ) : (
            filteredStudents.map((stu) => {
              const isClaimed = Boolean(stu.account_claimed);
              return (
                <div
                  key={stu.id}
                  className="p-3.5 hover:bg-canvas-soft/60 transition-colors flex items-center justify-between gap-3"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono text-xs font-semibold text-ink shrink-0">
                        {stu.roll_number}
                      </span>
                      <span className="font-medium text-xs text-ink truncate">
                        {stu.full_name || stu.student_name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-canvas-soft border border-hairline text-ink-secondary">
                        <span className={`w-1.5 h-1.5 rounded-full ${isClaimed ? "bg-emerald-500" : "bg-ink-faint"}`} />
                        {isClaimed ? "Claimed" : "Unclaimed"}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      onDeleteStudent(stu.id, stu.full_name || stu.student_name || "")
                    }
                    className="p-1.5 rounded-md text-ink-muted hover:text-red-600 dark:hover:text-[#f28b82] hover:bg-red-50/70 dark:hover:bg-[#2a1313] transition-colors shrink-0 cursor-pointer"
                    title="Remove student from batch"
                  >
                    <Trash2 className="h-3.5 w-3.5 shrink-0" />
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Desktop View (sm+): Full Wide Table */}
        <div className="hidden sm:block max-h-[460px] overflow-y-auto overflow-x-auto relative">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="sticky top-0 z-10 bg-canvas-soft border-b border-hairline">
              <tr className="bg-canvas-soft text-xs font-medium text-ink-muted">
                <th className="px-4 py-3 bg-canvas-soft">Roll Number</th>
                <th className="px-4 py-3 bg-canvas-soft">Student Name</th>
                <th className="px-4 py-3 bg-canvas-soft">PWA Status</th>
                <th className="px-4 py-3 text-right bg-canvas-soft">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {loadingStudents ? (
                [1, 2, 3, 4].map((i) => (
                  <tr key={i} className="h-12">
                    <td className="px-4 py-3">
                      <Skeleton className="h-3.5 w-16" />
                    </td>
                    <td className="px-4 py-3">
                      <Skeleton className="h-3.5 w-36" />
                    </td>
                    <td className="px-4 py-3">
                      <Skeleton className="h-5 w-24 rounded-full" />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Skeleton className="h-6 w-12 rounded ml-auto" />
                    </td>
                  </tr>
                ))
              ) : filteredStudents.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-12 text-center text-ink-muted space-y-1"
                  >
                    <p className="font-semibold text-ink">No students found.</p>
                    <p className="text-xs">
                      {studentSearch
                        ? "No matches for your search query."
                        : "Add students manually or import an Excel roster."}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredStudents.map((stu) => {
                  const isClaimed = Boolean(stu.account_claimed);
                  return (
                    <tr
                      key={stu.id}
                      className="hover:bg-canvas-soft/60 transition-colors"
                    >
                      <td className="px-4 py-3 font-mono font-semibold text-ink">
                        {stu.roll_number}
                      </td>
                      <td className="px-4 py-3 font-medium text-ink">
                        {stu.full_name || stu.student_name}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-canvas-soft border border-hairline text-ink-secondary">
                          <span className={`w-1.5 h-1.5 rounded-full ${isClaimed ? "bg-emerald-500" : "bg-ink-faint"}`} />
                          {isClaimed ? "Claimed" : "Unclaimed"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() =>
                            onDeleteStudent(
                              stu.id,
                              stu.full_name || stu.student_name || ""
                            )
                          }
                          className="p-1.5 rounded-md text-ink-muted hover:text-red-600 dark:hover:text-[#f28b82] hover:bg-red-50/70 dark:hover:bg-[#2a1313] transition-colors cursor-pointer"
                          title="Remove student from batch"
                        >
                          <Trash2 className="h-3.5 w-3.5 shrink-0" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {filteredStudents.length > 5 && (
          <div className="px-4 py-2.5 bg-canvas-soft border-t border-hairline flex items-center justify-between text-xs text-ink-muted tabular-nums">
            <span>Total {filteredStudents.length} enrolled students</span>
            <span className="font-medium text-ink-secondary">
              {claimedCount} / {filteredStudents.length} claimed
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
