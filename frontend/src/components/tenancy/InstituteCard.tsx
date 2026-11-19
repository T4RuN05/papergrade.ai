"use client";

import React from "react";
import { Plus, Trash2, BookOpen, ShieldCheck, MapPin, Pencil } from "lucide-react";
import { FeatureCard, BadgePill, ButtonUtility } from "@/components/ui";
import { BranchCard } from "./BranchCard";

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

  return (
    <FeatureCard className="p-6 space-y-5">
      {/* Institute Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-hairline">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-ink">{institute.name}</h2>
            <BadgePill label={`Code: ${institute.code}`} color="purple" />
          </div>
          <p className="text-xs text-ink-muted font-mono">
            ID: {institute.id}
            {institute.created_at ? ` • Registered: ${new Date(institute.created_at).toLocaleDateString()}` : ""}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          <ButtonUtility
            size="sm"
            onClick={() => onAddBranch(institute.id)}
          >
            <Plus className="h-3.5 w-3.5 mr-1 text-primary" />
            Add Physical Branch
          </ButtonUtility>

          <ButtonUtility
            variant="danger"
            size="sm"
            onClick={() => onDeleteInstitute(institute)}
            title="Cascade delete institute, branches, batches, exams, scores, and cloud files"
          >
            <Trash2 className="h-3.5 w-3.5 mr-1" />
            Delete Institute
          </ButtonUtility>
        </div>
      </div>

      {/* Institute Curriculum & Subjects */}
      <div className="flex flex-wrap items-center gap-1.5 py-2 px-3 rounded-lg bg-surface border border-hairline">
        <span className="text-[11px] font-semibold text-ink-muted flex items-center gap-1 mr-1">
          <BookOpen className="h-3.5 w-3.5 text-primary" />
          Curriculum Subjects:
        </span>
        {(institute.subjects && Array.isArray(institute.subjects) && institute.subjects.length > 0
          ? institute.subjects
          : ["Physics", "Chemistry", "Maths", "Biology"]
        ).map((sub: string) => (
          <span
            key={sub}
            className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-canvas-soft border border-hairline text-ink"
          >
            {sub}
          </span>
        ))}
        <button
          type="button"
          onClick={() => onAddSubject(institute.id)}
          className="btn-glass-utility inline-flex items-center gap-1 text-[11px] font-semibold text-primary px-2 py-0.5 rounded-md cursor-pointer transition-all"
        >
          <Plus className="h-3 w-3" />
          Add Subject
        </button>
      </div>

      {/* Institute Directors Section */}
      <div className="rounded-lg border border-hairline bg-canvas-soft/70 p-3 sm:p-4 space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-ink flex items-center gap-1.5">
            <ShieldCheck className="h-4 w-4 text-purple-500" />
            Institute Directors ({instDirectors.length})
          </span>
          <button
            type="button"
            onClick={() => onAppointDirector(institute.id)}
            className="btn-glass-utility inline-flex items-center gap-1 text-[11px] font-semibold text-purple-600 dark:text-purple-400 px-2.5 py-1 rounded-md cursor-pointer transition-all"
          >
            <Plus className="h-3 w-3" />
            Appoint Director
          </button>
        </div>
        {instDirectors.length === 0 ? (
          <p className="text-xs text-ink-muted">
            No director appointed yet. An Institute Director can switch between all branches of this institute.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {instDirectors.map((dir) => (
              <div
                key={dir.id}
                className="flex items-center justify-between p-2 rounded-md bg-surface border border-hairline text-xs"
              >
                <div className="flex items-center gap-2 min-w-0 pr-2">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-purple-500/10 text-purple-600 font-bold text-[10px]">
                    {dir.full_name?.charAt(0).toUpperCase() || "D"}
                  </div>
                  <div className="truncate">
                    <p className="font-semibold text-ink truncate">{dir.full_name}</p>
                    <p className="text-[10px] text-ink-muted truncate">{dir.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <BadgePill
                    label={dir.is_active === 0 ? "Inactive" : "Active"}
                    color={dir.is_active === 0 ? "orange" : "green"}
                  />
                  <button
                    type="button"
                    onClick={() => onEditManager(dir)}
                    className="p-1 rounded text-ink-muted hover:text-ink hover:bg-canvas-soft transition-colors cursor-pointer"
                    title="Edit Director"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteManager(dir)}
                    className="p-1 rounded text-ink-muted hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                    title="Remove Director"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Branches List */}
      {instBranches.length === 0 ? (
        <div className="rounded-md border border-dashed border-hairline bg-canvas-soft/60 p-6 text-center space-y-2">
          <MapPin className="h-5 w-5 text-ink-muted mx-auto" />
          <p className="text-xs text-ink-muted">
            No physical campuses or centres registered for {institute.name} yet.
          </p>
          <button
            type="button"
            onClick={() => onAddBranch(institute.id)}
            className="text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1"
          >
            <Plus className="h-3.5 w-3.5" />
            Add First Branch
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
    </FeatureCard>
  );
};
