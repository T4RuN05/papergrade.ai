"use client";

import React from "react";
import { Check } from "lucide-react";
import { ModalCard, ButtonPrimary, ButtonUtility, BadgePill } from "@/components/ui";

interface PasswordResetItem {
  id: string;
  student_name?: string;
  roll_number?: string;
  status: string;
  student_email?: string;
  created_at: string;
  approved_at?: string;
}

interface PasswordResetRequestsModalProps {
  isOpen: boolean;
  onClose: () => void;
  branchName?: string;
  resets: PasswordResetItem[];
  actionLoadingId: string | null;
  onApprove: (id: string, name: string) => Promise<void>;
  onReject: (id: string, name: string) => Promise<void>;
}

export function PasswordResetRequestsModal({
  isOpen,
  onClose,
  branchName,
  resets,
  actionLoadingId,
  onApprove,
  onReject,
}: PasswordResetRequestsModalProps) {
  const pendingResets = resets.filter((r) => r.status === "PENDING");

  return (
    <ModalCard
      isOpen={isOpen}
      onClose={onClose}
      title={`Student Password Reset Requests • ${branchName || "Branch"}`}
      maxWidth="max-w-2xl"
    >
      <div className="space-y-4 text-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-ink-muted">
          <span className="leading-relaxed">
            Review requests from students who forgot their passwords. Approving allows the student to immediately set a new password on their live screen.
          </span>
          <span className="font-mono font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded text-[11px] shrink-0 self-start sm:self-auto">
            {pendingResets.length} Pending
          </span>
        </div>

        {resets.length === 0 ? (
          <div className="py-8 text-center text-ink-muted">
            No password reset requests submitted for this branch.
          </div>
        ) : (
          <div className="divide-y divide-hairline border border-hairline rounded-lg overflow-hidden max-h-[60vh] overflow-y-auto">
            {resets.map((req) => {
              const isPending = req.status === "PENDING";
              const isApproved = req.status === "APPROVED";
              const isCompleted = req.status === "COMPLETED";

              return (
                <div
                  key={req.id}
                  className="p-3 sm:p-3.5 bg-surface hover:bg-canvas-soft/40 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-1 min-w-0 w-full sm:w-auto">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm text-ink truncate max-w-[200px] sm:max-w-none">
                        {req.student_name || "Enrolled Student"}
                      </span>
                      <span className="font-mono text-xs text-ink-muted bg-canvas-soft border border-hairline px-2 py-0.5 rounded shrink-0">
                        {req.roll_number}
                      </span>
                      <BadgePill
                        label={req.status}
                        color={
                          isPending
                            ? "orange"
                            : isApproved
                            ? "teal"
                            : isCompleted
                            ? "green"
                            : "gray"
                        }
                      />
                    </div>
                    <div className="text-[11px] text-ink-muted flex items-center gap-1.5 sm:gap-3 flex-wrap">
                      {req.student_email && (
                        <span className="truncate max-w-[180px] sm:max-w-none">
                          {req.student_email}
                        </span>
                      )}
                      <span>
                        • Requested{" "}
                        {new Date(req.created_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      {req.approved_at && (
                        <span>
                          • Approved{" "}
                          {new Date(req.approved_at).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 w-full sm:w-auto shrink-0 pt-2 sm:pt-0 border-t sm:border-0 border-hairline/60">
                    {isPending ? (
                      <>
                        <button
                          type="button"
                          disabled={actionLoadingId === req.id}
                          onClick={() =>
                            onReject(req.id, req.student_name || req.roll_number || "")
                          }
                          className="flex-1 sm:flex-none px-3 py-1.5 text-xs font-semibold rounded-md border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors cursor-pointer text-center"
                        >
                          Reject
                        </button>
                        <ButtonPrimary
                          size="sm"
                          className="flex-1 sm:flex-none justify-center"
                          isLoading={actionLoadingId === req.id}
                          onClick={() =>
                            onApprove(req.id, req.student_name || req.roll_number || "")
                          }
                        >
                          <Check className="h-3.5 w-3.5 mr-1" />
                          Approve
                        </ButtonPrimary>
                      </>
                    ) : isApproved ? (
                      <span className="w-full sm:w-auto text-center text-[11px] font-semibold text-teal-700 bg-teal-50 border border-teal-200 px-2.5 py-1 rounded-md">
                        Approved • Waiting on Student
                      </span>
                    ) : isCompleted ? (
                      <span className="w-full sm:w-auto text-center text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-md">
                        Password Reset Completed
                      </span>
                    ) : (
                      <span className="w-full sm:w-auto text-center text-[11px] text-ink-faint">
                        Rejected
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex justify-end pt-2 border-t border-hairline">
          <ButtonUtility onClick={onClose}>Close</ButtonUtility>
        </div>
      </div>
    </ModalCard>
  );
}
