"use client";

import React from "react";
import { ShieldCheck, Loader2 } from "lucide-react";
import { ModalCard } from "@/components/ui";

export interface StaffPasswordResetsModalProps {
  isOpen: boolean;
  onClose: () => void;
  resets: any[];
  actingResetId: string | null;
  onApprove: (id: string, name: string) => Promise<void>;
  onReject: (id: string, name: string) => Promise<void>;
}

export const StaffPasswordResetsModal: React.FC<StaffPasswordResetsModalProps> = ({
  isOpen,
  onClose,
  resets,
  actingResetId,
  onApprove,
  onReject,
}) => {
  return (
    <ModalCard
      isOpen={isOpen}
      onClose={onClose}
      title="Staff Password Reset Authorizations"
      className="max-w-2xl"
    >
      <div className="space-y-4">
        <div className="p-3 rounded-md bg-canvas-soft border border-hairline text-xs text-ink-muted leading-relaxed">
          Staff members who request a password reset from the login screen remain in an active waiting state until approved here. Upon approval, their screen immediately unlocks to set their new password.
        </div>

        <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
          {resets.length === 0 ? (
            <div className="py-12 text-center text-xs text-ink-muted space-y-1.5">
              <ShieldCheck className="h-8 w-8 text-ink-muted mx-auto opacity-50" />
              <p className="font-semibold text-ink">No Staff Password Reset Requests</p>
              <p className="text-[11px]">
                When an Institute Director or Branch Manager requests a reset, it appears here in real time.
              </p>
            </div>
          ) : (
            resets.map((req) => {
              const isPending = req.status === "PENDING";
              const isApproved = req.status === "APPROVED";
              const isRejected = req.status === "REJECTED";
              const isCompleted = req.status === "COMPLETED";

              const roleLabel =
                req.user_role === "INSTITUTE_DIRECTOR"
                  ? "Director"
                  : req.user_role === "BRANCH_MANAGER"
                  ? "Branch Manager"
                  : req.user_role || "Staff";

              const statusDotClass = isPending
                ? "bg-amber-500"
                : isApproved || isCompleted
                ? "bg-emerald-500"
                : "bg-ink-faint";

              return (
                <div
                  key={req.id}
                  className="p-3 sm:p-3.5 rounded-lg bg-surface border border-hairline flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                >
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-ink text-sm truncate">
                        {req.student_name || "Staff Member"}
                      </span>
                      <span className="px-1.5 py-0.5 rounded-xs bg-canvas-soft border border-hairline text-[11px] font-medium text-ink-secondary">
                        {roleLabel}
                      </span>
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-xs bg-canvas-soft border border-hairline text-[11px] font-medium text-ink-secondary">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusDotClass}`} />
                        <span>{req.status}</span>
                      </span>
                    </div>
                    <div className="text-[11px] text-ink-muted flex items-center gap-x-2 gap-y-0.5 flex-wrap">
                      <span className="truncate">{req.student_email || "No email"}</span>
                      {req.branch_name && <span>• {req.branch_name}</span>}
                      <span>
                        •{" "}
                        {new Date(req.created_at).toLocaleString([], {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  </div>

                  <div className="shrink-0 w-full sm:w-auto">
                    {isPending ? (
                      <div className="grid grid-cols-2 sm:flex sm:items-center gap-2">
                        <button
                          type="button"
                          disabled={actingResetId === req.id}
                          onClick={() => onReject(req.id, req.student_name || "Staff")}
                          className="notion-btn-danger justify-center disabled:opacity-50"
                        >
                          Reject
                        </button>
                        <button
                          type="button"
                          disabled={actingResetId === req.id}
                          onClick={() => onApprove(req.id, req.student_name || "Staff")}
                          className="notion-btn-primary justify-center disabled:opacity-50"
                        >
                          {actingResetId === req.id && (
                            <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                          )}
                          <span>Approve</span>
                        </button>
                      </div>
                    ) : (
                      <span className="text-[11px] font-mono text-ink-muted">
                        {isApproved
                          ? "Waiting for user input"
                          : isCompleted
                          ? "Completed"
                          : isRejected
                          ? "Rejected"
                          : req.status}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="flex justify-end pt-2 border-t border-hairline">
          <button
            type="button"
            onClick={onClose}
            className="notion-btn-utility"
          >
            Close
          </button>
        </div>
      </div>
    </ModalCard>
  );
};
