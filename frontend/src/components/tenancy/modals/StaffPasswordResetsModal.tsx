"use client";

import React from "react";
import { ShieldCheck } from "lucide-react";
import { ModalCard, BadgePill, ButtonUtility, ButtonPrimary } from "@/components/ui";

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
        <div className="p-3 rounded-lg bg-canvas-soft border border-hairline text-xs text-ink-muted leading-relaxed">
          Staff members who request a password reset from the login screen remain in an active waiting state until approved here. Upon approval, their screen immediately unlocks to set their new password.
        </div>

        <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
          {resets.length === 0 ? (
            <div className="py-12 text-center text-xs text-ink-muted space-y-1">
              <ShieldCheck className="h-8 w-8 text-ink-muted mx-auto opacity-50" />
              <p className="font-semibold text-ink">No Staff Password Reset Requests</p>
              <p className="text-[11px]">When an Institute Director or Branch Manager requests a reset, it appears here in real time.</p>
            </div>
          ) : (
            resets.map((req) => {
              const isPending = req.status === "PENDING";
              const isApproved = req.status === "APPROVED";
              const isRejected = req.status === "REJECTED";
              const isCompleted = req.status === "COMPLETED";

              const roleBadgeColor =
                req.user_role === "INSTITUTE_DIRECTOR"
                  ? "indigo"
                  : req.user_role === "BRANCH_MANAGER"
                  ? "teal"
                  : "purple";

              const roleBadgeLabel =
                req.user_role === "INSTITUTE_DIRECTOR"
                  ? "Director"
                  : req.user_role === "BRANCH_MANAGER"
                  ? "Branch Mgr"
                  : req.user_role || "Staff";

              return (
                <div
                  key={req.id}
                  className="p-3 sm:p-3.5 rounded-lg bg-surface border border-hairline flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                >
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-ink text-sm">
                        {req.student_name || "Staff Member"}
                      </span>
                      <BadgePill label={roleBadgeLabel} color={roleBadgeColor as any} />
                      <BadgePill
                        label={req.status}
                        color={isPending ? "orange" : isApproved || isCompleted ? "green" : "gray"}
                      />
                    </div>
                    <div className="text-[11px] text-ink-muted flex items-center gap-2 flex-wrap">
                      <span>{req.student_email || "No email"}</span>
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

                  <div className="flex items-center gap-2 shrink-0">
                    {isPending ? (
                      <>
                        <ButtonUtility
                          size="sm"
                          disabled={actingResetId === req.id}
                          onClick={() => onReject(req.id, req.student_name || "Staff")}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30 text-xs"
                        >
                          Reject
                        </ButtonUtility>
                        <ButtonPrimary
                          size="sm"
                          disabled={actingResetId === req.id}
                          isLoading={actingResetId === req.id}
                          onClick={() => onApprove(req.id, req.student_name || "Staff")}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
                        >
                          Approve Reset
                        </ButtonPrimary>
                      </>
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
          <ButtonUtility type="button" onClick={onClose}>
            Close
          </ButtonUtility>
        </div>
      </div>
    </ModalCard>
  );
};
