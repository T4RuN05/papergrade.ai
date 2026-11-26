import React from "react";
import Link from "next/link";
import { Shield, ArrowLeft, Lock, FileCheck, Database, CheckCircle2, XCircle } from "lucide-react";

export const metadata = {
  title: "Privacy Policy — PaperGrade AI",
  description: "PaperGrade AI Privacy Policy and Google Drive BYOS Data Usage Terms.",
};

export default function PrivacyPolicyPage() {
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
            <Shield className="w-3.5 h-3.5 text-ink-muted shrink-0" />
            <span>Compliance &amp; Transparency</span>
          </div>
          <h1 className="notion-heading-2 sm:text-[32px] text-ink">Privacy Policy</h1>
          <p className="text-xs sm:text-[13px] text-ink-muted">
            Effective Date: November 25, 2026 &middot; Last Updated: November 25, 2026
          </p>
        </div>

        <article className="notion-card p-5 sm:p-8 space-y-7 text-[14px] leading-relaxed text-ink-secondary">
          <section className="space-y-2.5">
            <h2 className="notion-section-title text-base sm:text-[18px] text-ink flex items-center gap-2">
              <Lock className="w-4 h-4 text-ink-muted shrink-0" />
              <span>1. Overview &amp; Commitment</span>
            </h2>
            <p>
              PaperGrade AI (&quot;we,&quot; &quot;our,&quot; or &quot;us&quot;) provides an automated, AI-assisted exam evaluation and student feedback platform for educational institutions. We are committed to protecting the privacy of educational institutes, administrators, faculty, and students.
            </p>
            <p>
              This Privacy Policy explains what personal information we collect, how it is used, and how students and staff retain sovereignty over their educational records and examination documents.
            </p>
          </section>

          <section className="pt-5 border-t border-hairline space-y-2.5">
            <h2 className="notion-section-title text-base sm:text-[18px] text-ink flex items-center gap-2">
              <Database className="w-4 h-4 text-ink-muted shrink-0" />
              <span>2. Information We Collect</span>
            </h2>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>
                <strong className="font-semibold text-ink">Account Credentials:</strong> Full name, institutional email address, assigned roll number, and salted cryptographic password hashes (via bcrypt).
              </li>
              <li>
                <strong className="font-semibold text-ink">Academic Data:</strong> Exam submissions, scanned answer scripts (PDFs), assigned rubrics, criterion marks, and AI/faculty feedback annotations.
              </li>
              <li>
                <strong className="font-semibold text-ink">Security &amp; Telemetry:</strong> IP addresses, browser user-agent tokens, and cryptographic session identifiers strictly used for brute-force rate-limiting and audit logging.
              </li>
            </ul>
          </section>

          <section className="p-4 sm:p-5 rounded-md border border-hairline bg-canvas-soft space-y-3.5">
            <h2 className="notion-section-title text-base sm:text-[18px] text-ink flex items-center gap-2">
              <FileCheck className="w-4 h-4 text-primary shrink-0" />
              <span>3. Google OAuth 2.0 &amp; Google Drive (BYOS) Integration</span>
            </h2>
            <p>
              PaperGrade AI offers a <em>Bring Your Own Storage</em> (BYOS) architecture, allowing students and staff to link their personal Google accounts to receive permanent, immutable copies of their graded examination papers directly into their personal Google Drive.
            </p>

            <div className="space-y-1.5">
              <h3 className="text-xs font-semibold text-ink">Scope Usage</h3>
              <p className="text-[13px]">
                When connecting your Google Account, PaperGrade AI requests the minimal non-sensitive scope:
              </p>
              <code className="inline-block max-w-full break-all px-2.5 py-1 rounded-xs border border-hairline bg-surface font-mono text-xs text-primary">
                https://www.googleapis.com/auth/drive.file
              </code>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3.5 rounded-md border border-hairline bg-surface space-y-1.5">
                <span className="font-semibold text-ink flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-accent-green shrink-0" />
                  <span>What PaperGrade AI CAN do</span>
                </span>
                <p className="text-ink-muted leading-relaxed">
                  Create a dedicated folder titled{" "}
                  <code className="font-mono text-ink bg-canvas-soft px-1 py-0.5 rounded-xs border border-hairline">
                    My Drive/PaperGrade AI
                  </code>{" "}
                  and save your published, graded exam PDFs into it.
                </p>
              </div>

              <div className="p-3.5 rounded-md border border-hairline bg-surface space-y-1.5">
                <span className="font-semibold text-ink flex items-center gap-1.5">
                  <XCircle className="w-3.5 h-3.5 text-ink-muted shrink-0" />
                  <span>What PaperGrade AI CANNOT do</span>
                </span>
                <p className="text-ink-muted leading-relaxed">
                  PaperGrade AI <strong className="font-semibold text-ink">cannot</strong> view, search, read, modify, or delete any of your personal files, photos, Google Docs, or folders in your Google Drive.
                </p>
              </div>
            </div>

            <p className="text-xs text-ink-muted leading-relaxed">
              Google user data received via OAuth (such as your Google sub ID, email, and display avatar) is used solely to authenticate your session and link your Google Drive folder. We <strong className="font-semibold text-ink">never</strong> transfer, sell, or disclose Google user data to third parties, external advertising networks, or unauthorized LLMs.
            </p>
          </section>

          <section className="pt-5 border-t border-hairline space-y-2.5">
            <h2 className="notion-section-title text-base sm:text-[18px] text-ink">
              4. Document Retention &amp; Cloudflare R2 Storage
            </h2>
            <p>
              Raw student submissions and temporary annotated working files uploaded during live exam conduction are held securely in encrypted Cloudflare R2 object storage located in the Asia-Pacific region.
            </p>
            <p>
              In accordance with our strict document retention invariants, working upload files may be purged 15 days following the conclusion and publication of final grades. However, files archived into your connected Google Drive remain permanently accessible in your personal possession indefinitely.
            </p>
          </section>

          <section className="pt-5 border-t border-hairline space-y-2.5">
            <h2 className="notion-section-title text-base sm:text-[18px] text-ink">
              5. Data Sharing &amp; Third-Party Processors
            </h2>
            <p>
              We do not sell student or institutional data. Data is processed exclusively by our verified operational sub-processors:
            </p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>
                <strong className="font-semibold text-ink">Cloudflare Inc.:</strong> Edge DNS, DDoS mitigation, and encrypted object storage (R2).
              </li>
              <li>
                <strong className="font-semibold text-ink">GigaNodes VPS:</strong> Dedicated, high-performance private application runtime server.
              </li>
              <li>
                <strong className="font-semibold text-ink">Brevo (Sendinblue):</strong> Transactional email verification OTPs and urgent administrative security alerts.
              </li>
              <li>
                <strong className="font-semibold text-ink">Google Gemini API:</strong> Academic rubric reasoning and criterion scoring under strict zero-data-retention enterprise terms.
              </li>
            </ul>
          </section>

          <section className="pt-5 border-t border-hairline space-y-2.5">
            <h2 className="notion-section-title text-base sm:text-[18px] text-ink">
              6. User Rights &amp; Account Revocation
            </h2>
            <p>
              You have the right to access, rectify, or request the deletion of your personal data at any time. You can disconnect your Google account and revoke PaperGrade AI&apos;s access immediately via:
            </p>
            <p>
              Your Google Account Security Settings at{" "}
              <a
                href="https://myaccount.google.com/permissions"
                target="_blank"
                rel="noreferrer"
                className="text-primary underline hover:text-primary-active break-all"
              >
                https://myaccount.google.com/permissions
              </a>
              , or directly from the Student Portal settings panel.
            </p>
          </section>

          <section className="pt-5 border-t border-hairline space-y-3">
            <h2 className="notion-section-title text-base sm:text-[18px] text-ink">
              7. Contact &amp; Privacy Inquiries
            </h2>
            <p>
              If you have any questions regarding this Privacy Policy or wish to report a security inquiry, please contact our administrative data team:
            </p>
            <div className="p-4 rounded-md border border-hairline bg-canvas-soft font-mono text-xs space-y-1.5 text-ink-secondary">
              <div className="break-all">
                Email:{" "}
                <a href="mailto:support@papergradeai.in" className="text-primary hover:underline">
                  support@papergradeai.in
                </a>
              </div>
              <div className="break-all">
                Domain:{" "}
                <a href="https://www.papergradeai.in" className="text-primary hover:underline">
                  https://www.papergradeai.in
                </a>
              </div>
            </div>
          </section>
        </article>
      </main>

      {/* Footer */}
      <footer className="border-t border-hairline bg-canvas-soft py-6 text-xs text-ink-muted">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
          <span>&copy; {new Date().getFullYear()} PaperGrade AI. All rights reserved.</span>
          <div className="flex items-center gap-5">
            <Link href="/terms" className="hover:text-ink transition-colors">
              Terms of Service
            </Link>
            <Link href="/privacy" className="text-ink font-medium underline underline-offset-4">
              Privacy Policy
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
