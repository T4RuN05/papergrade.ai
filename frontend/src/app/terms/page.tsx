import React from "react";
import Link from "next/link";
import { ArrowLeft, FileText, CheckCircle2 } from "lucide-react";

export const metadata = {
  title: "Terms of Service — PaperGrade AI",
  description: "PaperGrade AI Terms of Service for educational institutes, faculty, and students.",
};

export default function TermsOfServicePage() {
  return (
    <div className="min-h-screen bg-canvas text-ink flex flex-col selection:bg-primary/20 selection:text-ink">
      {/* Header */}
      <header className="border-b border-hairline bg-surface/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2 text-sm text-ink-muted hover:text-ink transition-colors font-medium"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </Link>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-semibold tracking-wider uppercase text-ink-muted">
              PaperGrade AI Legal
            </span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-4xl mx-auto px-6 py-12 md:py-16">
        <div className="mb-10 pb-6 border-b border-hairline">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold mb-4">
            <FileText className="w-3.5 h-3.5" />
            Platform Agreement
          </div>
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">Terms of Service</h1>
          <p className="mt-2 text-sm text-ink-muted">
            Effective Date: November 25, 2026 • Last Updated: November 25, 2026
          </p>
        </div>

        <div className="prose prose-neutral dark:prose-invert max-w-none space-y-8 text-sm leading-relaxed text-ink/90">
          <section>
            <h2 className="text-lg font-bold text-ink mb-3">1. Acceptance of Terms</h2>
            <p>
              By accessing or using the PaperGrade AI platform located at <a href="https://www.papergradeai.in" className="text-primary underline">https://www.papergradeai.in</a> (including associated subdomains and APIs), you agree to be bound by these Terms of Service. If you do not agree to these terms, do not access or use our services.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-ink mb-3">2. Description of Platform</h2>
            <p>
              PaperGrade AI provides software tools for educational institutions, educators, and students, including exam creation, digital answer script submission, optical character and handwriting processing, AI-assisted rubric grading, revaluation workflows, and persistent cloud storage archiving.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-ink mb-3">3. Account Integrity & Security</h2>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>
                <strong>Student Accounts:</strong> Students must claim and access accounts using their verified institutional roll number or linked email address. Sharing account credentials during examination windows is strictly prohibited.
              </li>
              <li>
                <strong>Staff Accounts:</strong> Institute Directors, Branch Managers, and Evaluators are responsible for maintaining the confidentiality of their authentication tokens and passwords.
              </li>
              <li>
                <strong>Multi-Factor & OTP Delivery:</strong> Password reset requests and critical identity changes are validated via cryptographically generated 6-digit numeric OTPs dispatched to registered email addresses.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-ink mb-3">4. Bring Your Own Storage (BYOS) & Google Drive</h2>
            <p>
              Users may elect to connect their Google Drive accounts using Google OAuth 2.0 to preserve immutable copies of their published examination papers:
            </p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>
                PaperGrade AI accesses Google Drive solely under the restrictive <code className="font-mono text-xs text-primary">drive.file</code> scope to write published results into a dedicated folder.
              </li>
              <li>
                Users retain full, permanent ownership over files transferred to their Google Drive. PaperGrade AI does not claim any intellectual property rights over student answer sheets or institutional test content.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-ink mb-3">5. Academic Integrity & Responsible Use</h2>
            <p>
              Users agree not to:
            </p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>Submit fraudulent, tampered, or malicious documents during live examination windows.</li>
              <li>Reverse-engineer, decompile, or overload the PaperGrade AI platform or underlying AI evaluation APIs.</li>
              <li>Bypass rate-limiting thresholds or attempt unauthorized horizontal privilege escalation between educational institutes.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-ink mb-3">6. Service Level & Operational Windows</h2>
            <p>
              PaperGrade AI operates under a decoupled evaluation architecture where student exam conduction and AI evaluation run in dedicated, non-overlapping windows to guarantee zero server latency during critical student submission periods. Results are published according to institutional evaluation schedules and notifications are dispatched via web-push and in-portal alerts.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-ink mb-3">7. Contact Information</h2>
            <p>
              For legal inquiries, institutional licensing, or support requests:
            </p>
            <div className="mt-3 p-4 rounded-md border border-hairline bg-surface font-mono text-xs space-y-1">
              <div>Email: <a href="mailto:support@papergradeai.in" className="text-primary hover:underline">support@papergradeai.in</a></div>
              <div>PaperGrade AI Operations — C-25 Tech Hub</div>
            </div>
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-hairline py-6 text-center text-xs text-ink-muted">
        <div className="max-w-4xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <span>&copy; {new Date().getFullYear()} PaperGrade AI. All rights reserved.</span>
          <div className="flex gap-4">
            <Link href="/terms" className="hover:text-ink transition-colors underline">
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
