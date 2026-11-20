"use client";

import React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Clock,
  BookOpen,
  Calendar,
  AlertCircle,
  HelpCircle,
} from "lucide-react";
import {
  getArticleBySlug,
  getAdjacentArticles,
  HELP_ROLE_TRACKS,
  RoleId,
} from "@/lib/helpDocsData";
import { UIReferencePill } from "@/components/help/UIReferencePill";
import { CalloutBox } from "@/components/help/CalloutBox";
import { ScreenshotFigure } from "@/components/help/ScreenshotFigure";
import { HelpTableOfContents } from "@/components/help/HelpTableOfContents";
import { BadgePill, ButtonUtility } from "@/components/ui";

export default function HelpArticlePage() {
  const params = useParams();
  const router = useRouter();
  const role = params.role as RoleId;
  const slug = params.slug as string;

  const article = getArticleBySlug(role, slug);
  const track = HELP_ROLE_TRACKS.find((t) => t.id === role);
  const { prev, next } = getAdjacentArticles(role, slug);

  if (!article || !track) {
    return (
      <div className="py-16 text-center space-y-4">
        <AlertCircle className="h-10 w-10 text-ink-muted mx-auto" />
        <h1 className="text-lg font-bold text-ink">Guide Not Found</h1>
        <p className="text-xs text-ink-muted max-w-sm mx-auto">
          The requested guide does not exist or may have been moved.
        </p>
        <Link
          href="/help"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-xs font-semibold"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Help Center</span>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex items-start justify-between gap-8 animate-in fade-in duration-150">
      {/* Center Article Content */}
      <article className="flex-1 min-w-0 max-w-3xl space-y-8 pb-16">
        {/* Breadcrumb Header */}
        <div className="flex items-center gap-1.5 text-xs text-ink-muted flex-wrap">
          <Link href="/help" className="hover:text-ink transition-colors">
            Help Center
          </Link>
          <span className="text-ink-faint">/</span>
          <span className="text-ink font-medium">{track.label}</span>
          <span className="text-ink-faint">/</span>
          <span className="font-mono text-[11px] text-ink-muted">{article.guideCode}</span>
        </div>

        {/* Article Title & Meta */}
        <div className="space-y-3 pb-4 border-b border-hairline">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-md font-mono text-xs font-bold bg-canvas-soft border border-hairline text-primary">
              {article.guideCode}
            </span>
            <BadgePill label={track.badge} color="sky" />
            <div className="flex items-center gap-1 text-[11px] text-ink-muted ml-auto">
              <Clock className="h-3.5 w-3.5" />
              <span>{article.readTimeMinutes} min read</span>
            </div>
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-ink">
            {article.title}
          </h1>

          <p className="text-xs sm:text-sm text-ink-muted leading-relaxed">
            {article.summary}
          </p>
        </div>

        {/* Overview Intro */}
        {article.overview && (
          <div className="text-xs sm:text-sm text-ink leading-relaxed bg-surface/60 border border-hairline/80 rounded-xl p-4 shadow-2xs">
            {article.overview}
          </div>
        )}

        {/* Step-by-Step Instructions */}
        <div className="space-y-8">
          {article.steps.map((step, idx) => {
            const anchorId = `step-${idx + 1}`;

            return (
              <section key={anchorId} id={anchorId} className="space-y-2.5 scroll-mt-24">
                <h3 className="text-base sm:text-lg font-bold text-ink tracking-tight flex items-center gap-2">
                  <span className="h-6 w-6 rounded-full bg-primary/10 text-primary text-xs font-mono font-bold flex items-center justify-center shrink-0">
                    {idx + 1}
                  </span>
                  <span>{step.title.replace(/^\d+\.\s*/, "")}</span>
                </h3>

                <p className="text-xs sm:text-[13px] text-ink-secondary leading-relaxed pl-8">
                  {step.description}
                </p>

                {/* UI Elements Referenced */}
                {step.uiPills && step.uiPills.length > 0 && (
                  <div className="pl-8 pt-1 flex items-center gap-1.5 flex-wrap">
                    <span className="text-[11px] text-ink-muted font-medium">Click / Verify:</span>
                    {step.uiPills.map((pill, pIdx) => (
                      <UIReferencePill key={pIdx} label={pill.label} variant={pill.variant} />
                    ))}
                  </div>
                )}

                {/* Step Screenshot if attached */}
                {step.screenshot && (
                  <div className="pl-0 sm:pl-8 pt-2 flex justify-center">
                    <div className="w-full max-w-2xl">
                      <ScreenshotFigure
                        src={step.screenshot.suggestedPath}
                        caption={step.screenshot.caption}
                        pins={step.screenshot.pins}
                      />
                    </div>
                  </div>
                )}

                {/* Step Note / Callout */}
                {step.note && (
                  <div className="pl-0 sm:pl-8">
                    <CalloutBox type={step.noteType || "tip"}>{step.note}</CalloutBox>
                  </div>
                )}
              </section>
            );
          })}
        </div>

        {/* Frequently Asked Questions */}
        {article.faq && article.faq.length > 0 && (
          <section id="frequently-asked-questions" className="pt-6 border-t border-hairline space-y-4 scroll-mt-24">
            <h2 className="text-base font-bold text-ink flex items-center gap-2">
              <HelpCircle className="h-4 w-4 text-primary" />
              <span>Frequently Asked Questions</span>
            </h2>
            <div className="space-y-3">
              {article.faq.map((item, fIdx) => (
                <div key={fIdx} className="p-4 rounded-xl border border-hairline bg-surface space-y-1.5 shadow-2xs">
                  <h4 className="text-xs sm:text-sm font-bold text-ink">{item.question}</h4>
                  <p className="text-xs text-ink-muted leading-relaxed">{item.answer}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Bottom Pagination Links (Prev / Next) */}
        <div className="pt-8 border-t border-hairline flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {prev ? (
            <Link
              href={`/help/${prev.role}/${prev.slug}`}
              className="p-3 rounded-xl border border-hairline bg-surface hover:bg-canvas-soft transition-all text-left space-y-0.5 flex-1 group shadow-2xs"
            >
              <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-ink-muted">
                <ArrowLeft className="h-3 w-3 group-hover:-translate-x-0.5 transition-transform" />
                <span>Previous Guide</span>
              </div>
              <div className="text-xs font-bold text-ink truncate">{prev.title}</div>
            </Link>
          ) : (
            <div className="flex-1" />
          )}

          {next ? (
            <Link
              href={`/help/${next.role}/${next.slug}`}
              className="p-3 rounded-xl border border-hairline bg-surface hover:bg-canvas-soft transition-all text-right space-y-0.5 flex-1 group shadow-2xs"
            >
              <div className="flex items-center justify-end gap-1.5 text-[10px] font-bold uppercase tracking-wider text-ink-muted">
                <span>Next Guide</span>
                <ArrowRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
              </div>
              <div className="text-xs font-bold text-ink truncate">{next.title}</div>
            </Link>
          ) : (
            <div className="flex-1" />
          )}
        </div>
      </article>

      {/* Right Table of Contents (Sticky on Desktop) */}
      <HelpTableOfContents
        steps={article.steps}
        hasFaq={Boolean(article.faq && article.faq.length > 0)}
      />
    </div>
  );
}
