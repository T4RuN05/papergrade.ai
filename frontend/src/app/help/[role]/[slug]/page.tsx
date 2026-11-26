"use client";

import React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Clock,
  AlertCircle,
  HelpCircle,
  ChevronRight,
  BookOpen,
} from "lucide-react";
import {
  getArticleBySlug,
  getAdjacentArticles,
  HELP_ROLE_TRACKS,
  RoleId,
} from "@/lib/helpDocsData";
import { HelpSidebar } from "@/components/help/HelpSidebar";
import { UIReferencePill } from "@/components/help/UIReferencePill";
import { CalloutBox } from "@/components/help/CalloutBox";
import { ScreenshotFigure } from "@/components/help/ScreenshotFigure";
import { HelpTableOfContents } from "@/components/help/HelpTableOfContents";

export default function HelpArticlePage() {
  const params = useParams();
  const role = params.role as RoleId;
  const slug = params.slug as string;

  const article = getArticleBySlug(role, slug);
  const track = HELP_ROLE_TRACKS.find((t) => t.id === role);
  const { prev, next } = getAdjacentArticles(role, slug);

  if (!article || !track) {
    return (
      <div className="flex flex-col md:flex-row min-h-[calc(100vh-3.5rem)] bg-canvas-soft">
        <HelpSidebar />
        <div className="flex-1 min-w-0 flex items-center justify-center px-4 py-16">
          <div className="max-w-sm w-full rounded-lg border border-hairline bg-surface p-6 text-center space-y-4 shadow-notion-card">
            <AlertCircle className="h-8 w-8 text-ink-muted mx-auto" />
            <div className="space-y-1">
              <h1 className="text-base font-semibold text-ink">Guide not found</h1>
              <p className="text-xs text-ink-muted leading-relaxed">
                The requested manual chapter does not exist or may have been moved.
              </p>
            </div>
            <Link href="/help" className="notion-btn-primary inline-flex">
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Back to Help Center</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const hasFaq = Boolean(article.faq && article.faq.length > 0);

  return (
    <div className="flex flex-col md:flex-row min-h-[calc(100vh-3.5rem)] bg-canvas-soft">
      {/* Left Navigation Sidebar (Desktop sticky + Mobile compact chapter bar & drawer) */}
      <HelpSidebar currentGuideCode={article.guideCode} currentRoleBadge={track.badge} />

      {/* Center Editorial Reading Column + Right Sticky TOC */}
      <div className="flex-1 min-w-0 flex justify-center px-4 sm:px-8 lg:px-10 py-6 sm:py-10">
        <div className="w-full max-w-[1060px] flex items-start gap-8 lg:gap-10">
          <article className="flex-1 min-w-0 max-w-3xl space-y-8 pb-12">
            {/* Breadcrumb */}
            <nav
              aria-label="Breadcrumb"
              className="flex items-center gap-1.5 text-xs text-ink-muted flex-wrap"
            >
              <Link href="/help" className="hover:text-primary transition-colors">
                Help Center
              </Link>
              <ChevronRight className="h-3.5 w-3.5 text-ink-faint shrink-0" />
              <Link
                href={`/help?role=${track.id}`}
                className="hover:text-primary transition-colors"
              >
                {track.label}
              </Link>
              <ChevronRight className="h-3.5 w-3.5 text-ink-faint shrink-0" />
              <span className="font-mono text-ink font-medium">{article.guideCode}</span>
            </nav>

            {/* Article Header */}
            <header className="space-y-3 pb-6 border-b border-hairline">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-xs font-mono text-xs font-semibold bg-surface border border-hairline text-primary">
                    {article.guideCode}
                  </span>
                  <span className="text-xs font-medium text-ink-muted">{track.badge}</span>
                </div>

                <div className="flex items-center gap-3 text-xs text-ink-muted tabular-nums">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    <span>{article.readTimeMinutes} min read</span>
                  </span>
                  <span className="text-ink-faint">·</span>
                  <span>{article.steps.length} steps</span>
                </div>
              </div>

              <h1 className="notion-heading-2 text-2xl sm:text-[32px] text-ink leading-tight">
                {article.title}
              </h1>

              <p className="text-sm sm:text-[15px] text-ink-muted leading-relaxed">
                {article.summary}
              </p>
            </header>

            {/* Overview */}
            {article.overview && (
              <div className="rounded-lg border border-hairline bg-surface p-4 sm:p-5 space-y-1.5 shadow-notion-card">
                <p className="notion-eyebrow text-ink-muted">Overview</p>
                <p className="text-sm text-ink-secondary leading-relaxed">{article.overview}</p>
              </div>
            )}

            {/* Article-level Hero Screenshot (if defined) */}
            {article.screenshotSlot && (
              <ScreenshotFigure
                src={article.screenshotSlot.suggestedPath}
                caption={article.screenshotSlot.caption}
                pins={article.screenshotSlot.pins}
              />
            )}

            {/* Mobile & Tablet Inline Collapsible TOC */}
            <HelpTableOfContents
              variant="inline"
              steps={article.steps}
              hasFaq={hasFaq}
            />

            {/* Step-by-Step Instructions */}
            <div className="space-y-8">
              {article.steps.map((step, idx) => {
                const anchorId = `step-${idx + 1}`;
                const cleanTitle = step.title.replace(/^\d+\.\s*/, "");
                const isLastStep = idx === article.steps.length - 1;

                return (
                  <section
                    key={anchorId}
                    id={anchorId}
                    className={`scroll-mt-44 md:scroll-mt-32 xl:scroll-mt-20 space-y-3 ${
                      !isLastStep ? "pb-8 border-b border-hairline" : ""
                    }`}
                  >
                    <h2 className="text-base sm:text-lg font-semibold text-ink tracking-tight flex items-start gap-3 leading-snug">
                      <span className="h-6 w-6 sm:h-7 sm:w-7 rounded-md bg-surface border border-hairline text-primary text-xs font-mono font-semibold flex items-center justify-center shrink-0 tabular-nums mt-0.5">
                        {idx + 1}
                      </span>
                      <span className="pt-0.5">{cleanTitle}</span>
                    </h2>

                    <div className="sm:pl-10 space-y-3">
                      <p className="text-sm text-ink-secondary leading-[1.65]">
                        {step.description}
                      </p>

                      {step.uiPills && step.uiPills.length > 0 && (
                        <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                          <span className="text-xs text-ink-muted font-medium mr-0.5">
                            Interface controls:
                          </span>
                          {step.uiPills.map((pill, pIdx) => (
                            <UIReferencePill
                              key={pIdx}
                              label={pill.label}
                              variant={pill.variant}
                            />
                          ))}
                        </div>
                      )}

                      {step.screenshot && (
                        <ScreenshotFigure
                          src={step.screenshot.suggestedPath}
                          caption={step.screenshot.caption}
                          pins={step.screenshot.pins}
                        />
                      )}

                      {step.note && (
                        <CalloutBox type={step.noteType || "tip"}>{step.note}</CalloutBox>
                      )}
                    </div>
                  </section>
                );
              })}
            </div>

            {/* Frequently Asked Questions */}
            {hasFaq && article.faq && (
              <section
                id="frequently-asked-questions"
                className="pt-8 border-t border-hairline space-y-4 scroll-mt-44 md:scroll-mt-32 xl:scroll-mt-20"
              >
                <div className="flex items-center gap-2">
                  <HelpCircle className="h-4 w-4 text-primary shrink-0" />
                  <h2 className="notion-section-title text-base sm:text-lg text-ink">
                    Frequently asked questions
                  </h2>
                </div>
                <div className="space-y-3">
                  {article.faq.map((item, fIdx) => (
                    <div
                      key={fIdx}
                      className="p-4 sm:p-5 rounded-lg border border-hairline bg-surface space-y-1.5"
                    >
                      <h3 className="text-sm font-semibold text-ink leading-snug">
                        {item.question}
                      </h3>
                      <p className="text-xs sm:text-sm text-ink-secondary leading-relaxed">
                        {item.answer}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Prev / Next Chapter Pagination */}
            <nav
              aria-label="Chapter pagination"
              className="pt-8 border-t border-hairline grid grid-cols-1 sm:grid-cols-2 gap-3"
            >
              {prev ? (
                <Link
                  href={`/help/${prev.role}/${prev.slug}`}
                  className="group p-4 rounded-lg border border-hairline bg-surface hover:border-ink-faint transition-colors flex flex-col justify-between gap-1.5 text-left"
                >
                  <div className="flex items-center gap-1.5 text-xs font-medium text-ink-muted">
                    <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" />
                    <span>Previous · {prev.guideCode}</span>
                  </div>
                  <div className="text-sm font-semibold text-ink group-hover:text-primary transition-colors line-clamp-2">
                    {prev.title}
                  </div>
                </Link>
              ) : (
                <Link
                  href="/help"
                  className="group p-4 rounded-lg border border-hairline bg-surface hover:border-ink-faint transition-colors flex flex-col justify-between gap-1.5 text-left"
                >
                  <div className="flex items-center gap-1.5 text-xs font-medium text-ink-muted">
                    <BookOpen className="h-3.5 w-3.5" />
                    <span>Help Center</span>
                  </div>
                  <div className="text-sm font-semibold text-ink group-hover:text-primary transition-colors">
                    Browse all manuals
                  </div>
                </Link>
              )}

              {next ? (
                <Link
                  href={`/help/${next.role}/${next.slug}`}
                  className="group p-4 rounded-lg border border-hairline bg-surface hover:border-ink-faint transition-colors flex flex-col justify-between gap-1.5 text-left sm:text-right"
                >
                  <div className="flex items-center sm:justify-end gap-1.5 text-xs font-medium text-ink-muted">
                    <span>Next · {next.guideCode}</span>
                    <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                  </div>
                  <div className="text-sm font-semibold text-ink group-hover:text-primary transition-colors line-clamp-2">
                    {next.title}
                  </div>
                </Link>
              ) : (
                <Link
                  href={`/help?role=${track.id}`}
                  className="group p-4 rounded-lg border border-hairline bg-surface hover:border-ink-faint transition-colors flex flex-col justify-between gap-1.5 text-left sm:text-right"
                >
                  <div className="flex items-center sm:justify-end gap-1.5 text-xs font-medium text-ink-muted">
                    <span>End of {track.badge}</span>
                    <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                  </div>
                  <div className="text-sm font-semibold text-ink group-hover:text-primary transition-colors">
                    View all {track.badge} chapters
                  </div>
                </Link>
              )}
            </nav>
          </article>

          {/* Right Sticky Table of Contents (xl+) */}
          <HelpTableOfContents
            variant="sidebar"
            steps={article.steps}
            hasFaq={hasFaq}
          />
        </div>
      </div>
    </div>
  );
}
