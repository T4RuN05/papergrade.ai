"use client";

import React from "react";
import { Plus, Trash2, BookOpen, ShieldCheck, MapPin, Pencil } from "lucide-react";
import { BranchCard } from "./BranchCard";
import { StaffAvatar } from "./StaffAvatar";

export interface InstituteCardProps {
  institute: {
    id: string;
    name: string;
    code: string;
    subjects?: string[];
    created_at?: string;
  };
  branches: any[];
  directors: any[];
  managers: any[];
  onAddBranch: (instituteId: string) => void;
  onAppointDirector: (instituteId: string) => void;
  onAddSubject: (instituteId: string) => void;
  onDeleteInstitute: (institute: any) => void;
  onEditManager: (manager: any) => void;
  onDeleteManager: (manager: any) => void;
  onAssignManager: (branchId: string) => void;
  onSelectBranch: (branchId: string) => void;
}

export const InstituteCard: React.FC<InstituteCardProps> = ({
  institute,
  branches,
  directors,
  managers,
  onAddBranch,
  onAppointDirector,
  onAddSubject,
  onDeleteInstitute,
  onEditManager,
  onDeleteManager,
  onAssignManager,
  onSelectBranch,
}) => {
  const instBranches = branches.filter((b) => b.institute_id === institute.id);
  const instDirectors = directors.filter((d) => d.institute_id === institute.id);
  const subjectList =
    institute.subjects && Array.isArray(institute.subjects) && institute.subjects.length > 0
      ? institute.subjects
      : ["Physics", "Chemistry", "Maths", "Biology"];

  return (
    <div className="notion-card p-4 sm:p-6 space-y-5">
      {/* Institute Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-4 border-b border-hairline">
        <div className="space-y-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="notion-heading-3 text-lg sm:text-xl text-ink truncate">
              {institute.name}
            </h3>
            <span className="inline-flex items-center px-2 py-0.5 rounded-xs bg-canvas-soft border border-hairline font-mono text-xs font-medium text-ink-secondary shrink-0">
              {institute.code}
            </span>
          </div>
          <p className="text-xs text-ink-muted font-mono truncate">
            ID: {institute.id}
            {institute.created_at
              ? ` • Registered ${new Date(institute.created_at).toLocaleDateString()}`
              : ""}
          </p>
        </div>

        <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 shrink-0 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => onAddBranch(institute.id)}
            className="notion-btn-utility justify-center"
          >
            <Plus className="h-3.5 w-3.5 text-primary shrink-0" />
            <span className="truncate">Add Branch</span>
          </button>

          <button
            type="button"
            onClick={() => onDeleteInstitute(institute)}
            title="Cascade delete institute, branches, batches, exams, scores, and cloud files"
            className="notion-btn-danger justify-center"
          >
            <Trash2 className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">Delete</span>
          </button>
        </div>
      </div>

      {/* Institute Curriculum & Subjects */}
      <div className="flex flex-wrap items-center gap-1.5 p-2.5 sm:p-3 rounded-md bg-canvas-soft border border-hairline">
        <span className="text-xs font-medium text-ink-muted inline-flex items-center gap-1.5 mr-1">
          <BookOpen className="h-3.5 w-3.5 text-primary shrink-0" />
          <span>Subjects:</span>
        </span>
        {subjectList.map((sub: string) => (
          <span
            key={sub}
            className="px-2 py-0.5 rounded-xs text-xs font-medium bg-surface border border-hairline text-ink"
          >
            {sub}
          </span>
        ))}
        <button
          type="button"
          onClick={() => onAddSubject(institute.id)}
          className="notion-btn-utility min-h-[26px] px-2.5 py-0.5 text-xs text-primary"
        >
          <Plus className="h-3 w-3 shrink-0" />
          <span>Add Subject</span>
        </button>
      </div>

      {/* Institute Directors Section */}
      <div className="rounded-md border border-hairline bg-canvas-soft p-3.5 sm:p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <ShieldCheck className="h-4 w-4 text-primary shrink-0" />
            <span className="text-xs sm:text-sm font-semibold text-ink">
              Institute Directors
            </span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-surface border border-hairline text-ink-muted tabular-nums">
              {instDirectors.length}
            </span>
          </div>
          <button
            type="button"
            onClick={() => onAppointDirector(institute.id)}
            className="notion-btn-utility min-h-[30px] px-2.5 py-1 text-xs"
          >
            <Plus className="h-3 w-3 text-primary shrink-0" />
            <span>Appoint Director</span>
          </button>
        </div>

        {instDirectors.length === 0 ? (
          <p className="text-xs text-ink-muted leading-relaxed">
            No director appointed yet. An Institute Director can switch between all branches of this institute.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {instDirectors.map((dir) => {
              const isActive = dir.is_active !== 0;
              return (
                <div
                  key={dir.id}
                  className="flex items-center justify-between gap-2 p-2.5 rounded-md bg-surface border border-hairline text-xs min-w-0"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <StaffAvatar
                      name={dir.full_name}
                      pictureUrl={dir.google_picture}
                      fallback="D"
                      size="md"
                    />
                    <div className="min-w-0">
                      <p className="font-semibold text-ink truncate">{dir.full_name}</p>
                      <p className="text-[11px] text-ink-muted truncate">{dir.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-xs bg-canvas-soft border border-hairline text-[11px] font-medium text-ink-secondary mr-0.5">
                      <span
                        className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                          isActive ? "bg-emerald-500" : "bg-amber-500"
                        }`}
                      />
                      <span className="hidden sm:inline">{isActive ? "Active" : "Inactive"}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => onEditManager(dir)}
                      className="p-1.5 rounded-md text-ink-muted hover:text-ink hover:bg-canvas-soft transition-colors cursor-pointer"
                      title="Edit Director"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteManager(dir)}
                      className="p-1.5 rounded-md text-ink-muted hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors cursor-pointer"
                      title="Remove Director"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Branches List */}
      {instBranches.length === 0 ? (
        <div className="rounded-md border border-dashed border-hairline bg-canvas-soft p-6 text-center space-y-2.5">
          <MapPin className="h-5 w-5 text-ink-muted mx-auto" />
          <p className="text-xs text-ink-muted">
            No physical campuses or centres registered for {institute.name} yet.
          </p>
          <button
            type="button"
            onClick={() => onAddBranch(institute.id)}
            className="notion-btn-utility"
          >
            <Plus className="h-3.5 w-3.5 text-primary shrink-0" />
            <span>Add First Branch</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {instBranches.map((br) => (
            <BranchCard
              key={br.id}
              branch={br}
              managers={managers}
              onAssignManager={onAssignManager}
              onEditManager={onEditManager}
              onDeleteManager={onDeleteManager}
              onSelectBranch={onSelectBranch}
            />
          ))}
        </div>
      )}
    </div>
  );
};
