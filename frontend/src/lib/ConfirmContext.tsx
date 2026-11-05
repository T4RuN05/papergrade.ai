"use client";

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
} from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, AlertCircle, CheckCircle2 } from "lucide-react";

export type ConfirmVariant = "danger" | "warning" | "primary" | "info";

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: ConfirmVariant;
  destructive?: boolean;
}

interface ConfirmContextType {
  confirm: (options: ConfirmOptions | string) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextType | undefined>(undefined);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    options: ConfirmOptions;
  }>({
    isOpen: false,
    options: { message: "" },
  });

  const resolverRef = useRef<((value: boolean) => void) | null>(null);
  const [mounted, setMounted] = useState(false);
  const [isRendered, setIsRendered] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const confirm = useCallback((options: ConfirmOptions | string): Promise<boolean> => {
    const parsedOptions: ConfirmOptions =
      typeof options === "string" ? { message: options } : options;

    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setIsRendered(true);
      setIsExiting(false);
      setModalState({
        isOpen: true,
        options: parsedOptions,
      });
    });
  }, []);

  const handleConfirm = useCallback(() => {
    if (isExiting) return;
    setIsExiting(true);
    setTimeout(() => {
      setModalState((prev) => ({ ...prev, isOpen: false }));
      setIsRendered(false);
      setIsExiting(false);
      if (resolverRef.current) {
        resolverRef.current(true);
        resolverRef.current = null;
      }
    }, 200);
  }, [isExiting]);

  const handleCancel = useCallback(() => {
    if (isExiting) return;
    setIsExiting(true);
    setTimeout(() => {
      setModalState((prev) => ({ ...prev, isOpen: false }));
      setIsRendered(false);
      setIsExiting(false);
      if (resolverRef.current) {
        resolverRef.current(false);
        resolverRef.current = null;
      }
    }, 200);
  }, [isExiting]);

  // Lock body scroll and listen for Escape / Enter
  useEffect(() => {
    if (!isRendered) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleCancel();
      } else if (e.key === "Enter") {
        e.preventDefault();
        handleConfirm();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isRendered, handleCancel, handleConfirm]);

  const { options } = modalState;
  const isDanger = options.variant === "danger" || options.destructive;
  const isWarning = options.variant === "warning";
  const isPrimary = options.variant === "primary";

  let icon = <AlertCircle className="h-5 w-5 text-primary" />;
  let iconBgClass = "bg-primary/10 text-primary";
  let confirmBtnClass = "bg-primary hover:bg-primary-active text-white";

  if (isDanger) {
    icon = <AlertTriangle className="h-5 w-5 text-red-600" />;
    iconBgClass = "bg-red-50 text-red-600 border border-red-200/60";
    confirmBtnClass = "bg-red-600 hover:bg-red-700 text-white";
  } else if (isWarning) {
    icon = <AlertTriangle className="h-5 w-5 text-amber-600" />;
    iconBgClass = "bg-amber-50 text-amber-600 border border-amber-200/60";
    confirmBtnClass = "bg-amber-600 hover:bg-amber-700 text-white";
  } else if (isPrimary) {
    icon = <CheckCircle2 className="h-5 w-5 text-primary" />;
    iconBgClass = "bg-[#edf5fd] text-primary border border-primary/20";
    confirmBtnClass = "bg-primary hover:bg-primary-active text-white";
  }

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {mounted &&
        isRendered &&
        createPortal(
          <div
            className={`fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-4 ${
              isExiting ? "animate-modal-backdrop-out" : "animate-modal-backdrop-in"
            }`}
            role="dialog"
            aria-modal="true"
          >
            {/* Backdrop */}
            <div
              className="fixed inset-0 bg-black/45 backdrop-blur-xs transition-opacity"
              onClick={handleCancel}
              aria-hidden="true"
            />

            {/* Modal Card */}
            <div
              className={`relative w-full max-w-md bg-surface rounded-xl shadow-notion-modal border border-hairline z-10 overflow-hidden p-5 sm:p-6 space-y-4 ${
                isExiting ? "animate-modal-content-out" : "animate-modal-content-in"
              }`}
            >
              <div className="flex items-start gap-3.5">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-full shrink-0 ${iconBgClass}`}
                >
                  {icon}
                </div>
                <div className="space-y-1.5 min-w-0 flex-1">
                  <h3 className="text-base font-bold text-ink leading-tight">
                    {options.title || "Confirmation"}
                  </h3>
                  <p className="text-xs sm:text-sm text-ink-muted leading-relaxed">
                    {options.message}
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-hairline">
                <button
                  type="button"
                  onClick={handleCancel}
                  className="px-3.5 py-1.5 rounded-md border border-hairline bg-surface hover:bg-canvas-soft text-ink-secondary hover:text-ink text-xs sm:text-sm font-medium transition-colors"
                >
                  {options.cancelText || "Cancel"}
                </button>
                <button
                  type="button"
                  onClick={handleConfirm}
                  autoFocus
                  className={`px-4 py-1.5 rounded-md text-xs sm:text-sm font-semibold transition-colors shadow-xs ${confirmBtnClass}`}
                >
                  {options.confirmText || "Confirm"}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const context = useContext(ConfirmContext);
  if (!context) {
    throw new Error("useConfirm must be used within a ConfirmProvider");
  }
  return context;
}
