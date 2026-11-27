import React from "react";
import Link from "next/link";
import { ArrowLeft, FileText } from "lucide-react";

export const metadata = {
  title: "Terms of Service",
  description: "PaperGrade AI Terms of Service for educational institutes, faculty, and students.",
  alternates: {
    canonical: "/terms",
  },
};

export default function TermsOfServicePage() {
  return (
    <div className="min-h-screen bg-canvas-soft text-ink flex flex-col selection:bg-primary/20 selection:text-ink overflow-x-hidden">
      {/* Header */}
      <header className="border-b border-hairline bg-surface sticky top-0 z-40">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
          <Link
            href="/"
            className="notion-btn-utility !min-h-8 px-3 text-xs shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-ink-muted shrink-0" />
            <span>Back to Home</span>
          </Link>
          <span className="text-xs font-medium text-ink-muted truncate">
            PaperGrade AI Legal
          </span>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-6">
        <div className="pb-5 border-b border-hairline space-y-2.5">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-surface border border-hairline text-xs font-medium text-ink-secondary">
            <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
            <FileText className="w-3.5 h-3.5 text-ink-muted shrink-0" />
            <span>Platform Agreement</span>
          </div>
          <h1 className="notion-heading-2 sm:text-[32px] text-ink">Terms of Service</h1>
          <p className="text-xs sm:text-[13px] text-ink-muted">
            Effective Date: November 25, 2026 &middot; Last Updated: November 25, 2026
          </p>
        </div>

        <article className="notion-card p-5 sm:p-8 space-y-7 text-[14px] leading-relaxed text-ink-secondary">
          <section className="space-y-2.5">
            <h2 className="notion-section-title text-base sm:text-[18px] text-ink">
              1. Acceptance of Terms
            </h2>
            <p>
              By accessing or using the PaperGrade AI platform located at{" "}
              <a
                href="https://www.papergradeai.in"
                className="text-primary underline hover:text-primary-active break-all"
              >
                https://www.papergradeai.in
              </a>{" "}
              (including associated subdomains and APIs), you agree to be bound by these Terms of Service. If you do not agree to these terms, do not access or use our services.
            </p>
          </section>

          <section className="pt-5 border-t border-hairline space-y-2.5">
            <h2 className="notion-section-title text-base sm:text-[18px] text-ink">
              2. Description of Platform
            </h2>
            <p>
              PaperGrade AI provides software tools for educational institutions, educators, and students, including exam creation, digital answer script submission, optical character and handwriting processing, AI-assisted rubric grading, revaluation workflows, and persistent cloud storage archiving.
            </p>
          </section>

          <section className="pt-5 border-t border-hairline space-y-2.5">
            <h2 className="notion-section-title text-base sm:text-[18px] text-ink">
              3. Account Integrity &amp; Security
            </h2>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>
                <strong className="font-semibold text-ink">Student Accounts:</strong> Students must claim and access accounts using their verified institutional roll number or linked email address. Sharing account credentials during examination windows is strictly prohibited.
              </li>
              <li>
                <strong className="font-semibold text-ink">Staff Accounts:</strong> Institute Directors, Branch Managers, and Evaluators are responsible for maintaining the confidentiality of their authentication tokens and passwords.
              </li>
              <li>
                <strong className="font-semibold text-ink">Multi-Factor &amp; OTP Delivery:</strong> Password reset requests and critical identity changes are validated via cryptographically generated 6-digit numeric OTPs dispatched to registered email addresses.
              </li>
            </ul>
          </section>

          <section className="pt-5 border-t border-hairline space-y-2.5">
            <h2 className="notion-section-title text-base sm:text-[18px] text-ink">
              4. Bring Your Own Storage (BYOS) &amp; Google Drive
            </h2>
            <p>
              Users may elect to connect their Google Drive accounts using Google OAuth 2.0 to preserve immutable copies of their published examination papers:
            </p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>
                PaperGrade AI accesses Google Drive solely under the restrictive{" "}
                <code className="font-mono text-xs text-primary bg-canvas-soft px-1.5 py-0.5 rounded-xs border border-hairline">
                  drive.file
                </code>{" "}
                scope to write published results into a dedicated folder.
              </li>
              <li>
                Users retain full, permanent ownership over files transferred to their Google Drive. PaperGrade AI does not claim any intellectual property rights over student answer sheets or institutional test content.
              </li>
            </ul>
          </section>

          <section className="pt-5 border-t border-hairline space-y-2.5">
            <h2 className="notion-section-title text-base sm:text-[18px] text-ink">
              5. Academic Integrity &amp; Responsible Use
            </h2>
            <p>Users agree not to:</p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>Submit fraudulent, tampered, or malicious documents during live examination windows.</li>
              <li>Reverse-engineer, decompile, or overload the PaperGrade AI platform or underlying AI evaluation APIs.</li>
              <li>Bypass rate-limiting thresholds or attempt unauthorized horizontal privilege escalation between educational institutes.</li>
            </ul>
          </section>

          <section className="pt-5 border-t border-hairline space-y-2.5">
            <h2 className="notion-section-title text-base sm:text-[18px] text-ink">
              6. Service Level &amp; Operational Windows
            </h2>
            <p>
              PaperGrade AI operates under a decoupled evaluation architecture where student exam conduction and AI evaluation run in dedicated, non-overlapping windows to guarantee zero server latency during critical student submission periods. Results are published according to institutional evaluation schedules and notifications are dispatched via web-push and in-portal alerts.
            </p>
          </section>

          <section className="pt-5 border-t border-hairline space-y-3">
            <h2 className="notion-section-title text-base sm:text-[18px] text-ink">
              7. Contact Information
            </h2>
            <p>
              For legal inquiries, institutional licensing, or support requests:
            </p>
            <div className="p-4 rounded-md border border-hairline bg-canvas-soft font-mono text-xs space-y-1.5 text-ink-secondary">
              <div className="break-all">
                Email:{" "}
                <a href="mailto:support@papergradeai.in" className="text-primary hover:underline">
                  support@papergradeai.in
                </a>
              </div>
              <div>PaperGrade AI Operations &mdash; C-25 Tech Hub</div>
            </div>
          </section>
        </article>
      </main>

      {/* Footer */}
      <footer className="border-t border-hairline bg-canvas-soft py-6 text-xs text-ink-muted">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
          <span>&copy; {new Date().getFullYear()} PaperGrade AI. All rights reserved.</span>
          <div className="flex items-center gap-5">
            <Link href="/terms" className="text-ink font-medium underline underline-offset-4">
              Terms of Service
            </Link>
            <Link href="/privacy" className="hover:text-ink transition-colors">
              Privacy Policy
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
