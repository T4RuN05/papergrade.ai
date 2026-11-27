"use client";

import React, { useState, useMemo } from "react";
import { Mail, Copy, Check, ArrowRight, CheckCircle2, Send, Loader2 } from "lucide-react";
import { ModalCard, FormInput } from "@/components/ui";
import { api } from "@/lib/api";

interface PilotInquiryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const PILOT_EMAIL = "support@papergradeai.in";

export function PilotInquiryModal({ isOpen, onClose }: PilotInquiryModalProps) {
  const [instituteName, setInstituteName] = useState("");
  const [city, setCity] = useState("");
  const [contactInfo, setContactInfo] = useState("");
  const [batchSize, setBatchSize] = useState("50–150 students");
  const [notes, setNotes] = useState("");
  const [copied, setCopied] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const briefText = useMemo(() => {
    const lines = [
      "PaperGrade AI — Coaching Institute Pilot Request",
      "-------------------------------------------------",
      `Institute: ${instituteName.trim() || "(Your Institute Name)"}`,
      `City: ${city.trim() || "(City)"}`,
      `Contact: ${contactInfo.trim() || "(Email or Phone)"}`,
      `Approx. Batch Size: ${batchSize}`,
    ];
    if (notes.trim()) {
      lines.push(`Test Cadence / Subjects: ${notes.trim()}`);
    }
    lines.push("", "Looking to pilot handwritten test grading with PaperGrade AI.");
    return lines.join("\n");
  }, [instituteName, city, contactInfo, batchSize, notes]);

  const mailtoHref = useMemo(() => {
    const subject = encodeURIComponent(
      `PaperGrade AI Pilot Inquiry — ${instituteName.trim() || "Coaching Institute"}`
    );
    const body = encodeURIComponent(briefText);
    return `mailto:${PILOT_EMAIL}?subject=${subject}&body=${body}`;
  }, [instituteName, briefText]);

  const handleCopyBrief = async () => {
    try {
      await navigator.clipboard.writeText(`To: ${PILOT_EMAIL}\n\n${briefText}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      // Clipboard API unavailable
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    const cleanInst = instituteName.trim();
    const cleanContact = contactInfo.trim();

    if (cleanInst.length < 2) {
      setErrorMsg("Please enter your institute name.");
      return;
    }
    if (cleanContact.length < 4) {
      setErrorMsg("Please enter your email or phone number so we can reach out.");
      return;
    }

    setSubmitting(true);
    try {
      await api.submitPilotInquiry({
        institute_name: cleanInst,
        city: city.trim(),
        contact_info: cleanContact,
        batch_size: batchSize,
        notes: notes.trim(),
      });
      setSubmitted(true);
    } catch (err: any) {
      setErrorMsg(
        err?.message ||
          `Could not reach server directly. You can use "Open in Mail App" or copy the brief to ${PILOT_EMAIL}.`
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setSubmitted(false);
    setErrorMsg(null);
    setInstituteName("");
    setCity("");
    setContactInfo("");
    setNotes("");
  };

  return (
    <ModalCard
      isOpen={isOpen}
      onClose={onClose}
      title="Request a Pilot Integration"
      maxWidth="max-w-lg"
    >
      {submitted ? (
        <div className="space-y-4 py-1">
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/[0.06] p-4 flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <div className="space-y-1 text-xs">
              <div className="font-semibold text-ink text-sm">Pilot walkthrough request sent</div>
              <p className="text-ink-secondary leading-relaxed">
                Your brief for <strong>{instituteName}</strong> has been dispatched to{" "}
                <span className="font-mono text-ink">{PILOT_EMAIL}</span>. If you shared an email address in{" "}
                <span className="font-medium text-ink">{contactInfo}</span>, a confirmation copy is on its way.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-hairline gap-2">
            <button
              type="button"
              onClick={handleReset}
              className="notion-btn-utility"
            >
              Submit Another
            </button>
            <button
              type="button"
              onClick={onClose}
              className="notion-btn-primary"
            >
              Done
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="text-xs text-ink-muted leading-relaxed">
            PaperGrade is actively piloting with coaching batches across descriptive weekly and mock test cycles. Share your institute details to schedule a live walkthrough on one of your upcoming papers.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormInput
              label="Institute Name"
              placeholder="e.g. Apex Science Academy"
              value={instituteName}
              onChange={(e) => setInstituteName(e.target.value)}
              required
            />
            <FormInput
              label="City"
              placeholder="e.g. Mumbai / Kota"
              value={city}
              onChange={(e) => setCity(e.target.value)}
            />
          </div>

          <FormInput
            label="Your Email or Phone"
            placeholder="director@institute.in or +91..."
            value={contactInfo}
            onChange={(e) => setContactInfo(e.target.value)}
            required
          />

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-ink-secondary block">
              Initial Pilot Batch Size
            </label>
            <div className="grid grid-cols-3 gap-2">
              {["Under 50", "50–150 students", "150+ students"].map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => setBatchSize(size)}
                  className={`px-2.5 py-2 rounded-md text-xs font-medium border transition-colors cursor-pointer ${
                    batchSize === size
                      ? "bg-primary/10 border-primary text-primary"
                      : "bg-surface border-hairline text-ink-secondary hover:bg-canvas-soft"
                  }`}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-ink-secondary block">
              Subjects &amp; Test Cadence (Optional)
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Weekly Physics & Chemistry subjective tests, 30–50 marks"
              className="w-full rounded-xs border border-[#dddddd] dark:border-[#333333] bg-surface px-3 py-2 text-xs text-ink placeholder:text-ink-faint focus:border-primary focus:outline-none transition-colors"
            />
          </div>

          {errorMsg && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
              {errorMsg}
            </div>
          )}

          <div className="pt-2 border-t border-hairline flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopyBrief}
                className="notion-btn-utility justify-center flex-1 sm:flex-initial"
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-accent-green shrink-0" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5 text-ink-muted shrink-0" />
                    <span>Copy Brief</span>
                  </>
                )}
              </button>

              <a
                href={mailtoHref}
                className="notion-btn-utility justify-center flex-1 sm:flex-initial"
                title={`Open in your mail app (${PILOT_EMAIL})`}
              >
                <Mail className="h-3.5 w-3.5 text-ink-muted shrink-0" />
                <span>Mail App</span>
              </a>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="notion-btn-primary justify-center"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                  <span>Sending...</span>
                </>
              ) : (
                <>
                  <Send className="h-3.5 w-3.5 shrink-0" />
                  <span>Send Pilot Request</span>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0" />
                </>
              )}
            </button>
          </div>
        </form>
      )}
    </ModalCard>
  );
}
