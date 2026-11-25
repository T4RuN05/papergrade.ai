import React from "react";
import Link from "next/link";
import { Shield, ArrowLeft, Lock, FileCheck, Database, CheckCircle2 } from "lucide-react";

export const metadata = {
  title: "Privacy Policy — PaperGrade AI",
  description: "PaperGrade AI Privacy Policy and Google Drive BYOS Data Usage Terms.",
};

export default function PrivacyPolicyPage() {
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
            <Shield className="w-3.5 h-3.5" />
            Compliance & Transparency
          </div>
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">Privacy Policy</h1>
          <p className="mt-2 text-sm text-ink-muted">
            Effective Date: November 25, 2026 • Last Updated: November 25, 2026
          </p>
        </div>

        <div className="prose prose-neutral dark:prose-invert max-w-none space-y-8 text-sm leading-relaxed text-ink/90">
          <section>
            <h2 className="text-lg font-bold text-ink mb-3 flex items-center gap-2">
              <Lock className="w-4 h-4 text-primary" /> 1. Overview & Commitment
            </h2>
            <p>
              PaperGrade AI (&quot;we,&quot; &quot;our,&quot; or &quot;us&quot;) provides an automated, AI-assisted exam evaluation and student feedback platform for educational institutions. We are committed to protecting the privacy of educational institutes, administrators, faculty, and students.
            </p>
            <p className="mt-2">
              This Privacy Policy explains what personal information we collect, how it is used, and how students and staff retain sovereignty over their educational records and examination documents.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-ink mb-3 flex items-center gap-2">
              <Database className="w-4 h-4 text-primary" /> 2. Information We Collect
            </h2>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>
                <strong>Account Credentials:</strong> Full name, institutional email address, assigned roll number, and salted cryptographic password hashes (via bcrypt).
              </li>
              <li>
                <strong>Academic Data:</strong> Exam submissions, scanned answer scripts (PDFs), assigned rubrics, criterion marks, and AI/faculty feedback annotations.
              </li>
              <li>
                <strong>Security & Telemetry:</strong> IP addresses, browser user-agent tokens, and cryptographic session identifiers strictly used for brute-force rate-limiting and audit logging.
              </li>
            </ul>
          </section>

          <section className="p-5 rounded-lg border border-hairline bg-surface/50">
            <h2 className="text-lg font-bold text-ink mb-3 flex items-center gap-2">
              <FileCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              3. Google OAuth 2.0 & Google Drive (BYOS) Integration
            </h2>
            <p>
              PaperGrade AI offers a <em>Bring Your Own Storage</em> (BYOS) architecture, allowing students and staff to link their personal Google accounts to receive permanent, immutable copies of their graded examination papers directly into their personal Google Drive.
            </p>
            
            <h3 className="font-semibold text-ink text-sm mt-4 mb-2">Scope Usage:</h3>
            <p>
              When connecting your Google Account, PaperGrade AI requests the minimal non-sensitive scope:
              <br />
              <code className="px-2 py-0.5 rounded bg-muted font-mono text-xs text-primary">
                https://www.googleapis.com/auth/drive.file
              </code>
            </p>
            
            <div className="my-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded border border-emerald-500/20 bg-emerald-500/5">
                <span className="font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5 mb-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> What PaperGrade AI CAN do:
                </span>
                Create a dedicated folder titled <code className="font-mono">My Drive/PaperGrade AI</code> and save your published, graded exam PDFs into it.
              </div>
              <div className="p-3 rounded border border-rose-500/20 bg-rose-500/5">
                <span className="font-bold text-rose-700 dark:text-rose-400 flex items-center gap-1.5 mb-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> What PaperGrade AI CANNOT do:
                </span>
                PaperGrade AI <strong>cannot</strong> view, search, read, modify, or delete any of your personal files, photos, Google Docs, or folders in your Google Drive.
              </div>
            </div>

            <p className="text-xs text-ink-muted">
              Google user data received via OAuth (such as your Google sub ID, email, and display avatar) is used solely to authenticate your session and link your Google Drive folder. We <strong>never</strong> transfer, sell, or disclose Google user data to third parties, external advertising networks, or unauthorized LLMs.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-ink mb-3">4. Document Retention & Cloudflare R2 Storage</h2>
            <p>
              Raw student submissions and temporary annotated working files uploaded during live exam conduction are held securely in encrypted Cloudflare R2 object storage located in the Asia-Pacific region.
            </p>
            <p className="mt-2">
              In accordance with our strict document retention invariants, working upload files may be purged 15 days following the conclusion and publication of final grades. However, files archived into your connected Google Drive remain permanently accessible in your personal possession indefinitely.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-ink mb-3">5. Data Sharing & Third-Party Processors</h2>
            <p>
              We do not sell student or institutional data. Data is processed exclusively by our verified operational sub-processors:
            </p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li><strong>Cloudflare Inc.:</strong> Edge DNS, DDoS mitigation, and encrypted object storage (R2).</li>
              <li><strong>GigaNodes VPS:</strong> Dedicated, high-performance private application runtime server.</li>
              <li><strong>Brevo (Sendinblue):</strong> Transactional email verification OTPs and urgent administrative security alerts.</li>
              <li><strong>Google Gemini API:</strong> Academic rubric reasoning and criterion scoring under strict zero-data-retention enterprise terms.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-ink mb-3">6. User Rights & Account Revocation</h2>
            <p>
              You have the right to access, rectify, or request the deletion of your personal data at any time. You can disconnect your Google account and revoke PaperGrade AI&apos;s access immediately via:
            </p>
            <p className="mt-1">
              Your Google Account Security Settings at{" "}
              <a
                href="https://myaccount.google.com/permissions"
                target="_blank"
                rel="noreferrer"
                className="text-primary underline hover:opacity-80"
              >
                https://myaccount.google.com/permissions
              </a>
              , or directly from the Student Portal settings panel.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-ink mb-3">7. Contact & Privacy Inquiries</h2>
            <p>
              If you have any questions regarding this Privacy Policy or wish to report a security inquiry, please contact our administrative data team:
            </p>
            <div className="mt-3 p-4 rounded-md border border-hairline bg-surface font-mono text-xs space-y-1">
              <div>Email: <a href="mailto:support@papergradeai.in" className="text-primary hover:underline">support@papergradeai.in</a></div>
              <div>Domain: <a href="https://www.papergradeai.in" className="text-primary hover:underline">https://www.papergradeai.in</a></div>
            </div>
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-hairline py-6 text-center text-xs text-ink-muted">
        <div className="max-w-4xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <span>&copy; {new Date().getFullYear()} PaperGrade AI. All rights reserved.</span>
          <div className="flex gap-4">
            <Link href="/terms" className="hover:text-ink transition-colors">
              Terms of Service
            </Link>
            <Link href="/privacy" className="hover:text-ink transition-colors underline">
              Privacy Policy
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
