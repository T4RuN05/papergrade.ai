"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, BookOpen, Mail } from "lucide-react";
import { ScrollReveal, WordRevealText } from "@/components/landing/ScrollReveal";
import { SpotlightFrame } from "@/components/landing/SpotlightFrame";
import { PilotInquiryModal } from "@/components/landing/PilotInquiryModal";

export default function AboutPage() {
  const [pilotModalOpen, setPilotModalOpen] = useState(false);

  useEffect(() => {
    const handler = () => setPilotModalOpen(true);
    window.addEventListener("papergrade:open-pilot", handler);
    return () => window.removeEventListener("papergrade:open-pilot", handler);
  }, []);

  return (
    <div className="min-h-screen bg-canvas-soft text-ink">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-20 space-y-14 sm:space-y-20">
        {/* Hero */}
        <header className="space-y-5 border-b border-hairline pb-10">
          <div className="animate-landing-mount-blur inline-flex items-center gap-2 px-3 py-1 rounded-full border border-hairline bg-surface text-xs font-medium text-ink-secondary">
            <span className="h-1.5 w-1.5 rounded-full bg-accent-green shrink-0" />
            <span>About PaperGrade AI</span>
          </div>

          <h1 className="text-3xl sm:text-5xl font-bold tracking-[-0.03em] text-ink leading-[1.1]">
            <WordRevealText
              text="Built so coaching institutes never have to choose between handwritten exams and timely feedback."
              baseDelayMs={70}
              stepMs={36}
            />
          </h1>

          <p
            className="animate-landing-mount-blur text-sm sm:text-base text-ink-secondary leading-relaxed max-w-2xl"
            style={{ animationDelay: "140ms" }}
          >
            PaperGrade AI is currently in active pilot with coaching batches—streamlining manual paper checking for subjective weekly and mock exams while keeping teachers in complete authority over rubrics and final scores.
          </p>
        </header>

        {/* The Problem & Approach */}
        <ScrollReveal>
          <section className="grid grid-cols-1 md:grid-cols-12 gap-6 sm:gap-10">
            <div className="md:col-span-4">
              <div className="notion-eyebrow text-primary uppercase tracking-wider font-mono">
                Why We Built This
              </div>
              <h2 className="notion-heading-3 text-xl text-ink mt-1.5">
                Board &amp; entrance mastery happens on paper.
              </h2>
            </div>

            <div className="md:col-span-8 space-y-4 text-sm text-ink-secondary leading-relaxed">
              <p>
                Offline coaching batches still conduct descriptive tests on paper because real examinations demand written derivations, diagrams, and clear step-by-step reasoning. Converting subjective tests into online MCQs hides conceptual gaps rather than measuring them.
              </p>
              <p>
                Yet checking stacks of 10-page answer booklets across dozens of students takes days of manual faculty time—often resulting in delayed scoreboards, brief single-number marks without explanation, and repetitive re-totaling requests.
              </p>
              <p className="text-ink font-medium">
                PaperGrade bridges that gap: students write on paper as always, rubrics are locked per question step, and faculty receive mapped, verifiable evaluations ready to review and publish.
              </p>
            </div>
          </section>
        </ScrollReveal>

        {/* Operating Principles */}
        <ScrollReveal delayMs={60}>
          <section className="space-y-6">
            <div className="space-y-1">
              <div className="notion-eyebrow text-primary uppercase tracking-wider font-mono">
                Operating Principles
              </div>
              <h2 className="notion-heading-2 text-2xl text-ink">
                Four rules behind every test cycle.
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                {
                  title: "Handwritten paper stays primary",
                  body: "Students write with pen on physical sheets and snap pages from their phone—or coordinators upload scanned batch booklets cleanly.",
                },
                {
                  title: "Criteria-locked partial marking",
                  body: "Evaluations follow teacher-approved steps and point weights. Every mark awarded or deducted traces back to an annotated region on the script.",
                },
                {
                  title: "Timed collection, batch evaluation",
                  body: "Live test windows stay dedicated to smooth student submissions; queued batches are evaluated cleanly and held until faculty approves publication.",
                },
                {
                  title: "Human authority on appeals",
                  body: "Students can contest any question mark. Revaluation appeals go directly to teachers with cropped handwriting and audit notes—never auto-dismissed.",
                },
              ].map((item) => (
                <SpotlightFrame key={item.title} className="p-5">
                  <div className="space-y-1.5">
                    <h3 className="text-sm sm:text-base font-bold text-ink">{item.title}</h3>
                    <p className="text-xs sm:text-sm text-ink-muted leading-relaxed">
                      {item.body}
                    </p>
                  </div>
                </SpotlightFrame>
              ))}
            </div>
          </section>
        </ScrollReveal>

        {/* Pilot Invitation */}
        <ScrollReveal delayMs={80}>
          <section className="rounded-xl border border-hairline bg-surface shadow-notion-card p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            <div className="space-y-2 max-w-xl">
              <div className="text-xs font-mono uppercase tracking-wider text-primary font-semibold">
                Partner With Us
              </div>
              <h2 className="notion-heading-2 text-xl sm:text-2xl text-ink">
                Run a co-monitored pilot on one upcoming test.
              </h2>
              <p className="text-xs sm:text-sm text-ink-muted leading-relaxed">
                Share one batch roster and marking scheme—we help onboard faculty, configure the first exam rubric, and walk through the graded scripts with your academic team.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => setPilotModalOpen(true)}
                className="notion-btn-primary px-4"
              >
                <Mail className="h-3.5 w-3.5 shrink-0" />
                <span>Request Pilot</span>
                <ArrowRight className="h-3.5 w-3.5 shrink-0" />
              </button>
              <Link href="/help" className="notion-btn-utility px-4">
                <BookOpen className="h-3.5 w-3.5 text-ink-muted shrink-0" />
                <span>Guides</span>
              </Link>
            </div>
          </section>
        </ScrollReveal>
      </div>

      {/* Simple Public Legal Footer on /about */}
      <footer className="border-t border-hairline bg-canvas-soft py-6 text-xs text-ink-muted">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <span>© {new Date().getFullYear()} PaperGrade AI · Coaching Examination Grading Platform</span>
          <div className="flex items-center gap-5">
            <Link href="/" className="hover:text-ink transition-colors">
              Home
            </Link>
            <Link href="/help" className="hover:text-ink transition-colors">
              Manual
            </Link>
            <Link href="/faq" className="hover:text-ink transition-colors">
              FAQ
            </Link>
            <Link href="/privacy" className="hover:text-ink transition-colors">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-ink transition-colors">
              Terms
            </Link>
          </div>
        </div>
      </footer>

      <PilotInquiryModal isOpen={pilotModalOpen} onClose={() => setPilotModalOpen(false)} />
    </div>
  );
}
