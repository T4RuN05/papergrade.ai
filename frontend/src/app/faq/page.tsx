import type { Metadata } from "next";
import React from "react";
import Link from "next/link";
import { ArrowLeft, BookOpen, HelpCircle } from "lucide-react";
import { buildFaqJsonLd, PUBLIC_FAQ_ENTRIES, SITE_URL } from "@/lib/seoSchema";

export const metadata: Metadata = {
  title: "Frequently Asked Questions (FAQ)",
  description:
    "Answers to common questions about PaperGrade AI handwritten subjective exam grading, teacher-locked step-marking rubrics, student PDF uploads, appeals, and coaching branch workflows.",
  alternates: {
    canonical: "/faq",
  },
  openGraph: {
    title: "Frequently Asked Questions | PaperGrade AI",
    description:
      "Everything coaching institutes, faculty, and students ask about PaperGrade AI handwritten paper evaluation.",
    url: `${SITE_URL}/faq`,
  },
};

export default function FaqPage() {
  return (
    <div className="min-h-screen bg-canvas-soft text-ink flex flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(buildFaqJsonLd()),
        }}
      />
      <header className="border-b border-hairline bg-surface sticky top-0 z-40">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
          <Link href="/" className="notion-btn-utility !min-h-8 px-3 text-xs shrink-0">
            <ArrowLeft className="w-3.5 h-3.5 text-ink-muted shrink-0" />
            <span>Back to Home</span>
          </Link>
          <Link href="/help" className="notion-btn-utility !min-h-8 px-3 text-xs shrink-0">
            <BookOpen className="w-3.5 h-3.5 text-primary shrink-0" />
            <span>User Manual</span>
          </Link>
        </div>
      </header>

      <main className="flex-1 w-full max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-8">
        <header className="pb-6 border-b border-hairline space-y-2.5">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-surface border border-hairline text-xs font-medium text-ink-secondary">
            <HelpCircle className="w-3.5 h-3.5 text-primary shrink-0" />
            <span>Platform FAQ</span>
          </div>
          <h1 className="notion-heading-2 sm:text-[32px] text-ink">
            Frequently Asked Questions
          </h1>
          <p className="text-xs sm:text-sm text-ink-muted leading-relaxed">
            Direct answers on how PaperGrade AI evaluates handwritten answer sheets, preserves faculty rubric control, and organizes multi-branch coaching tests.
          </p>
        </header>

        <section className="space-y-4">
          {PUBLIC_FAQ_ENTRIES.map((item) => (
            <article
              key={item.question}
              className="notion-card p-5 space-y-2"
            >
              <h2 className="text-sm sm:text-base font-semibold text-ink">
                {item.question}
              </h2>
              <p className="text-xs sm:text-sm text-ink-secondary leading-relaxed">
                {item.answer}
              </p>
            </article>
          ))}
        </section>

        <section className="rounded-lg border border-hairline bg-surface p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-sm font-semibold text-ink">Looking for workflow screenshots or role steps?</h2>
            <p className="text-xs text-ink-muted">
              Browse the full Student, Faculty, and Director manuals in the Help Center.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link href="/about" className="notion-btn-utility text-xs px-3">
              About PaperGrade
            </Link>
            <Link href="/help" className="notion-btn-primary text-xs px-3">
              Explore Manuals
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
