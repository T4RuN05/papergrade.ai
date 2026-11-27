"use client";

import React, { useEffect, useState, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { ArrowRight, ChevronRight, BookOpen } from "lucide-react";
import { api, getAuthToken, getStoredUser } from "@/lib/api";

const LogoLoader = dynamic(() => import("@/components/LogoLoader/LogoLoader"), {
  ssr: false,
});
import { HeroMotionStage } from "@/components/landing/HeroMotionStage";
import { BlendedFeatureCard } from "@/components/landing/SpotlightFrame";
import { ScrollReveal, WordRevealText } from "@/components/landing/ScrollReveal";
import { PilotInquiryModal } from "@/components/landing/PilotInquiryModal";
import { SheetMappingMicro } from "@/components/landing/micros/SheetMappingMicro";
import { RubricLockMicro } from "@/components/landing/micros/RubricLockMicro";
import { ScheduleQueueMicro } from "@/components/landing/micros/ScheduleQueueMicro";
import { HumanAppealMicro } from "@/components/landing/micros/HumanAppealMicro";
import {
  BranchScopingMicro,
  RankedExportMicro,
  TrajectoryMicro,
} from "@/components/landing/micros/InstituteOpsMicros";

export default function LandingPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isRedirectingStudent, setIsRedirectingStudent] = useState(false);
  const [pilotModalOpen, setPilotModalOpen] = useState(false);

  const footerRef = useRef<HTMLElement>(null);
  const [footerHeight, setFooterHeight] = useState<number>(480);

  useEffect(() => {
    const openPilotHandler = () => setPilotModalOpen(true);
    window.addEventListener("papergrade:open-pilot", openPilotHandler);
    return () => window.removeEventListener("papergrade:open-pilot", openPilotHandler);
  }, []);

  useEffect(() => {
    const handleResize = () => {
      if (footerRef.current) {
        const measured = Math.ceil(
          footerRef.current.getBoundingClientRect().height || footerRef.current.offsetHeight
        );
        if (measured > 0) {
          setFooterHeight(measured);
        }
      }
    };

    handleResize();

    const observer =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            handleResize();
          })
        : null;

    if (observer && footerRef.current) {
      observer.observe(footerRef.current);
    }

    window.addEventListener("resize", handleResize);
    const timer = setTimeout(handleResize, 300);

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", handleResize);
      clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    const token = getAuthToken();
    const storedUser = getStoredUser();

    if (token && storedUser?.role === "STUDENT") {
      setIsRedirectingStudent(true);
      router.replace("/student/portal");
      return;
    }

    if (storedUser) {
      setCurrentUser(storedUser);
      return;
    }

    if (token) {
      api
        .getMe()
        .then((user) => {
          setCurrentUser(user);
          if (user?.role === "STUDENT") {
            setIsRedirectingStudent(true);
            router.replace("/student/portal");
          }
        })
        .catch(() => setCurrentUser(null));
    }
  }, [router]);

  if (isRedirectingStudent) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[75vh] space-y-3 bg-canvas-soft">
        <LogoLoader size={46} duration={1.3} label="Opening Student Portal" />
        <p className="text-xs font-semibold tracking-wide text-ink-muted">
          Opening Student Portal...
        </p>
      </div>
    );
  }

  const portalHref = currentUser
    ? currentUser.role === "ROOT_ADMIN"
      ? "/overview"
      : currentUser.role === "BRANCH_MANAGER" || currentUser.role === "INSTITUTE_DIRECTOR"
      ? "/branch/batches"
      : "/student/portal"
    : "/auth/login";

  const portalLabel = currentUser
    ? currentUser.role === "ROOT_ADMIN"
      ? "Open Administrator Desk"
      : currentUser.role === "BRANCH_MANAGER" || currentUser.role === "INSTITUTE_DIRECTOR"
      ? "Open Academic Console"
      : "Open Student Portal"
    : "Open Portal";

  return (
    <div className="relative w-full">
      {/* Main Page Document Layer */}
      <div className="relative z-10 w-full bg-canvas-soft border-b border-hairline shadow-[0_25px_50px_-12px_rgba(0,0,0,0.16)] overflow-hidden">
        {/* Subtle Paper Grid confined strictly to Hero region */}
        <div
          aria-hidden="true"
          className="absolute top-0 left-0 right-0 h-[520px] sm:h-[600px] pointer-events-none select-none z-0"
          style={{
            backgroundImage: `
              linear-gradient(to right, var(--grid-line) 1px, transparent 1px),
              linear-gradient(to bottom, var(--grid-line) 1px, transparent 1px)
            `,
            backgroundSize: "28px 28px",
            maskImage:
              "linear-gradient(to bottom, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.5) 55%, rgba(0,0,0,0) 100%)",
            WebkitMaskImage:
              "linear-gradient(to bottom, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.5) 55%, rgba(0,0,0,0) 100%)",
          }}
        />

        <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 sm:pt-16 pb-20 sm:pb-28 space-y-16 sm:space-y-24">
          {/* 0. HERO STATEMENT (Immediate Staggered Mount Blur-Fade) */}
          <section className="text-center max-w-3xl mx-auto space-y-5 sm:space-y-6 pt-2 sm:pt-4">
            <div className="flex justify-center animate-landing-mount-blur">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-hairline bg-surface text-[11px] sm:text-xs font-medium text-ink-secondary">
                <span className="h-1.5 w-1.5 rounded-full bg-accent-green shrink-0" />
                <span>Pilot · Partnering with Coaching Institutes</span>
              </div>
            </div>

            <h1 className="text-3xl sm:text-5xl md:text-[56px] font-bold tracking-[-0.03em] text-ink leading-[1.12] sm:leading-[1.06]">
              <WordRevealText
                text="Handwritten tests graded against your rubric. Not guesswork."
                baseDelayMs={100}
                stepMs={58}
              />
            </h1>

            <p
              className="animate-landing-mount-blur text-sm sm:text-base md:text-lg text-ink-secondary leading-relaxed max-w-2xl mx-auto"
              style={{ animationDelay: "460ms" }}
            >
              PaperGrade turns scanned handwritten answer sheets into step-marked evaluations, mapped bounding-box feedback, and publish-ready batch rankings.
            </p>

            {/* Primary & Secondary Actions */}
            <div
              className="animate-landing-mount-blur pt-1 flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-2.5 sm:gap-3 max-w-xs sm:max-w-none mx-auto"
              style={{ animationDelay: "540ms" }}
            >
              <button
                type="button"
                onClick={() => setPilotModalOpen(true)}
                className="notion-btn-primary !min-h-[42px] px-5 text-sm font-medium w-full sm:w-auto"
              >
                <span>Request Pilot Integration</span>
                <ArrowRight className="h-4 w-4 shrink-0" />
              </button>

              <Link
                href={portalHref}
                className="notion-btn-utility !min-h-[42px] px-5 text-sm font-medium w-full sm:w-auto"
              >
                <span>{portalLabel}</span>
              </Link>
            </div>

            <div
              className="animate-landing-mount-blur pt-1 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-ink-muted"
              style={{ animationDelay: "610ms" }}
            >
              <Link
                href="/auth/login?role=claim"
                className="hover:text-ink transition-colors underline-offset-4 hover:underline"
              >
                Claim Student ID
              </Link>
              <span aria-hidden="true" className="text-ink-faint">
                ·
              </span>
              <Link
                href="/about"
                className="hover:text-ink transition-colors underline-offset-4 hover:underline"
              >
                About PaperGrade
              </Link>
              <span aria-hidden="true" className="text-ink-faint">
                ·
              </span>
              <Link
                href="/help"
                className="inline-flex items-center gap-1.5 hover:text-ink transition-colors underline-offset-4 hover:underline"
              >
                <BookOpen className="h-3.5 w-3.5 text-ink-faint" />
                <span>User Manual</span>
              </Link>
            </div>
          </section>

          {/* 1. CONNECTED 2-LAYER KINETIC PIPELINE */}
          <section
            aria-label="PaperGrade autonomous workflow simulation"
            className="animate-landing-mount-blur space-y-3"
            style={{ animationDelay: "680ms" }}
          >
            <HeroMotionStage />
          </section>

          {/* 2. THE EVALUATION CYCLE (Asymmetric Bento of Real Microcomponents) */}
          <section id="evaluation-cycle" className="scroll-mt-20 space-y-6 sm:space-y-8">
            <ScrollReveal>
              <div className="space-y-1.5 max-w-2xl">
                <div className="notion-eyebrow text-primary uppercase tracking-wider font-mono">
                  The Evaluation Cycle
                </div>
                <h2 className="notion-heading-2 text-2xl sm:text-[32px] text-ink">
                  Every stage built for real coaching workflows.
                </h2>
              </div>
            </ScrollReveal>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5">
              {/* Wide Card 1: Diagonal bottom-left lens blur over live sheet + rubric */}
              <ScrollReveal className="lg:col-span-7" delayMs={40}>
                <BlendedFeatureCard
                  overlayPosition="bottom-left"
                  title="Line-by-line grading on the sheet itself"
                  description="Every score ties back to a specific region on the student's paper and the exact rubric step that earned or lost marks."
                >
                  <SheetMappingMicro />
                </BlendedFeatureCard>
              </ScrollReveal>

              {/* Card 2: Bottom lens blur over rubric step locking */}
              <ScrollReveal className="lg:col-span-5" delayMs={110}>
                <BlendedFeatureCard
                  overlayPosition="bottom"
                  title="Rubrics locked before grading begins"
                  description="Define criterion weights, model answers, and optional best-of-N rules once per paper so every script is checked uniformly."
                >
                  <RubricLockMicro />
                </BlendedFeatureCard>
              </ScrollReveal>

              {/* Card 3: Alternating Top-down lens blur over day/night queue */}
              <ScrollReveal className="lg:col-span-5" delayMs={60}>
                <BlendedFeatureCard
                  overlayPosition="top"
                  title="Collect in class. Grade overnight."
                  description="Timed submission windows capture student scans during test hours, while queued batches process overnight for next-day review."
                >
                  <ScheduleQueueMicro />
                </BlendedFeatureCard>
              </ScrollReveal>

              {/* Wide Card 4: Diagonal bottom-left lens blur over revaluation desk */}
              <ScrollReveal className="lg:col-span-7" delayMs={130}>
                <BlendedFeatureCard
                  overlayPosition="bottom-left"
                  title="Teachers hold the final pen on appeals"
                  description="Students flag specific questions with a note. Faculty inspect the cropped handwriting directly and resolve appeals with an audit note."
                >
                  <HumanAppealMicro />
                </BlendedFeatureCard>
              </ScrollReveal>
            </div>
          </section>

          {/* 3. INSTITUTE OPERATIONS (Blended Microcomponents with Feathered Lens Blur) */}
          <section id="institutes" className="scroll-mt-20 space-y-6 sm:space-y-8">
            <ScrollReveal>
              <div className="space-y-1.5 max-w-2xl">
                <div className="notion-eyebrow text-primary uppercase tracking-wider font-mono">
                  Institute Operations
                </div>
                <h2 className="notion-heading-2 text-2xl sm:text-[32px] text-ink">
                  From branch rosters to student portals.
                </h2>
              </div>
            </ScrollReveal>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5">
              <ScrollReveal delayMs={40}>
                <BlendedFeatureCard
                  overlayPosition="bottom"
                  title="Branch & batch isolation"
                  description="Manage separate campuses, student roll sequences, and batch rosters under one institute console."
                >
                  <BranchScopingMicro />
                </BlendedFeatureCard>
              </ScrollReveal>

              <ScrollReveal delayMs={110}>
                <BlendedFeatureCard
                  overlayPosition="bottom"
                  title="Ranked standings & export"
                  description="Publish class standings when ready and export complete batch marks matrices in one click."
                >
                  <RankedExportMicro />
                </BlendedFeatureCard>
              </ScrollReveal>

              <ScrollReveal delayMs={180}>
                <BlendedFeatureCard
                  overlayPosition="bottom"
                  title="Longitudinal student insights"
                  description="Students track subject-wise marks across tests and inspect graded PDFs right from their phone."
                >
                  <TrajectoryMicro />
                </BlendedFeatureCard>
              </ScrollReveal>
            </div>
          </section>

          {/* 4. EARLY-STAGE PILOT ONBOARDING STRIP */}
          <ScrollReveal>
            <section id="pilot" className="scroll-mt-20">
              <div className="rounded-xl border border-hairline bg-surface shadow-notion-card p-6 sm:p-8 grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
                <div className="lg:col-span-6 space-y-4">
                  <div className="inline-flex items-center gap-2 text-[11px] font-mono uppercase tracking-wider font-semibold text-primary">
                    <span className="h-1.5 w-1.5 rounded-full bg-accent-green shrink-0" />
                    <span>Early-Stage Pilot Program</span>
                  </div>

                  <h2 className="notion-heading-2 text-2xl sm:text-[28px] text-ink">
                    Bring PaperGrade to your next test series.
                  </h2>

                  <p className="text-xs sm:text-sm text-ink-secondary leading-relaxed">
                    We are actively piloting with coaching institutes across weekly and mock test cycles—working directly with faculty to align rubrics, batch scan uploads, and student roll onboarding.
                  </p>

                  <div className="pt-1 flex flex-wrap items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => setPilotModalOpen(true)}
                      className="notion-btn-primary px-4"
                    >
                      <span>Request a Pilot Walkthrough</span>
                      <ArrowRight className="h-3.5 w-3.5 shrink-0" />
                    </button>
                    <Link href="/about" className="notion-btn-utility px-4">
                      <span>About PaperGrade</span>
                    </Link>
                    <Link
                      href="/help"
                      className="text-xs font-medium text-ink-muted hover:text-ink px-2 py-1.5 transition-colors underline-offset-4 hover:underline"
                    >
                      Role Guides →
                    </Link>
                  </div>
                </div>

                <div className="lg:col-span-6 rounded-lg border border-hairline bg-canvas-soft p-4 sm:p-5 space-y-3.5">
                  <div className="text-[11px] font-mono uppercase tracking-wider text-ink-muted font-semibold border-b border-hairline pb-2">
                    How a 1-Week Pilot Starts
                  </div>

                  <div className="space-y-3 text-xs">
                    <div className="space-y-0.5">
                      <div className="font-semibold text-ink">1. Roster &amp; Paper Setup</div>
                      <p className="text-ink-muted leading-relaxed">
                        Import one batch roster CSV and set up your upcoming subjective test paper with its step marking scheme.
                      </p>
                    </div>
                    <div className="space-y-0.5 pt-2.5 border-t border-hairline">
                      <div className="font-semibold text-ink">2. Co-Monitored Test Conduction</div>
                      <p className="text-ink-muted leading-relaxed">
                        Students snap pages through the live submission window—or staff uploads scanned batch PDFs in bulk.
                      </p>
                    </div>
                    <div className="space-y-0.5 pt-2.5 border-t border-hairline">
                      <div className="font-semibold text-ink">3. Next-Day Faculty Review &amp; Publish</div>
                      <p className="text-ink-muted leading-relaxed">
                        Teachers verify annotated marks, resolve any appeals with audit notes, and release student mark sheets.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </ScrollReveal>

          {/* 5. SIGN-IN & PORTAL ENTRY */}
          <ScrollReveal>
            <section className="space-y-3">
              <div className="text-[11px] font-mono uppercase tracking-wider text-ink-muted font-semibold">
                Portal Access
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Link
                  href="/auth/login?role=student"
                  className="group p-4 rounded-lg border border-hairline bg-surface hover:border-[#cfccc7] dark:hover:border-[#3d3d3d] transition-colors flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="text-xs sm:text-sm font-semibold text-ink">Student Login</div>
                    <div className="text-[11px] text-ink-muted truncate mt-0.5">
                      Submit papers &amp; view step marks
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-ink-muted group-hover:text-primary transition-colors shrink-0" />
                </Link>

                <Link
                  href="/auth/login?role=claim"
                  className="group p-4 rounded-lg border border-hairline bg-surface hover:border-[#cfccc7] dark:hover:border-[#3d3d3d] transition-colors flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="text-xs sm:text-sm font-semibold text-ink">Claim Student ID</div>
                    <div className="text-[11px] text-ink-muted truncate mt-0.5">
                      Activate account with roll number
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-ink-muted group-hover:text-primary transition-colors shrink-0" />
                </Link>

                <Link
                  href="/auth/login?role=staff"
                  className="group p-4 rounded-lg border border-hairline bg-surface hover:border-[#cfccc7] dark:hover:border-[#3d3d3d] transition-colors flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="text-xs sm:text-sm font-semibold text-ink">
                      Faculty &amp; Institute Staff
                    </div>
                    <div className="text-[11px] text-ink-muted truncate mt-0.5">
                      Rubrics, batches &amp; evaluations
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-ink-muted group-hover:text-primary transition-colors shrink-0" />
                </Link>
              </div>
            </section>
          </ScrollReveal>
        </div>
      </div>

      {/* Polarity-Flipped Reveal Footer (Strictly Public Links Only) */}
      <div
        className="relative w-full z-0 overflow-hidden"
        style={{
          clipPath: "polygon(0% 0, 100% 0%, 100% 100%, 0 100%)",
          height: footerHeight > 0 ? `${footerHeight}px` : "auto",
        }}
      >
        <footer
          ref={footerRef}
          className="fixed bottom-0 left-0 w-full z-0 bg-[#141413] dark:bg-[#f6f5f4] text-[#8e8d8a] dark:text-[#615d59] flex flex-col justify-between pt-8 sm:pt-14 pb-8 sm:pb-6 px-4 sm:px-12 md:px-16 select-none transition-colors duration-200"
        >
          <div className="max-w-5xl mx-auto w-full grid grid-cols-1 md:grid-cols-12 gap-8 md:gap-12">
            {/* Brand & Pilot Status */}
            <div className="md:col-span-5 space-y-3">
              <div className="flex items-center gap-2.5">
                <Image
                  src="/logo-icon.png"
                  alt="PaperGrade AI"
                  width={26}
                  height={26}
                  className="h-6 w-6 object-contain shrink-0"
                />
                <span className="text-sm font-bold text-white dark:text-[#111111] tracking-tight">
                  PaperGrade <span className="text-primary font-semibold">AI</span>
                </span>
              </div>
              <p className="text-xs text-[#9b9994] dark:text-[#504c48] leading-relaxed max-w-sm">
                Rubric-aligned evaluation and transparent mark breakdowns for handwritten coaching examinations.
              </p>
              <div className="pt-1 flex items-center gap-2 text-[11px] font-mono text-[#71706c] dark:text-[#78746f]">
                <span className="h-1.5 w-1.5 rounded-full bg-accent-green shrink-0" />
                <span>Open for Institute Pilots</span>
              </div>
            </div>

            {/* Strictly Public Navigation Columns */}
            <div className="md:col-span-7 grid grid-cols-2 sm:grid-cols-3 gap-6 text-xs">
              <div className="space-y-2">
                <div className="font-mono text-[11px] uppercase tracking-wider text-white dark:text-[#111111] font-semibold">
                  Platform
                </div>
                <ul className="space-y-1.5">
                  <li>
                    <Link
                      href="#evaluation-cycle"
                      className="hover:text-white dark:hover:text-[#111111] transition-colors"
                    >
                      Evaluation Workflow
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="#institutes"
                      className="hover:text-white dark:hover:text-[#111111] transition-colors"
                    >
                      Institute Operations
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="#pilot"
                      className="hover:text-white dark:hover:text-[#111111] transition-colors"
                    >
                      Pilot Program
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/auth/login"
                      className="hover:text-white dark:hover:text-[#111111] transition-colors"
                    >
                      Sign In
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/auth/login?role=claim"
                      className="hover:text-white dark:hover:text-[#111111] transition-colors"
                    >
                      Claim Student ID
                    </Link>
                  </li>
                </ul>
              </div>

              <div className="space-y-2">
                <div className="font-mono text-[11px] uppercase tracking-wider text-white dark:text-[#111111] font-semibold">
                  Resources
                </div>
                <ul className="space-y-1.5">
                  <li>
                    <Link
                      href="/help"
                      className="hover:text-white dark:hover:text-[#111111] transition-colors"
                    >
                      Help Center
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/help?role=student"
                      className="hover:text-white dark:hover:text-[#111111] transition-colors"
                    >
                      Student Guide
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/help?role=faculty"
                      className="hover:text-white dark:hover:text-[#111111] transition-colors"
                    >
                      Faculty Guide
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/help?role=director"
                      className="hover:text-white dark:hover:text-[#111111] transition-colors"
                    >
                      Admin Guide
                    </Link>
                  </li>
                </ul>
              </div>

              <div className="space-y-2">
                <div className="font-mono text-[11px] uppercase tracking-wider text-white dark:text-[#111111] font-semibold">
                  Company &amp; Legal
                </div>
                <ul className="space-y-1.5">
                  <li>
                    <Link
                      href="/about"
                      className="hover:text-white dark:hover:text-[#111111] transition-colors"
                    >
                      About PaperGrade
                    </Link>
                  </li>
                  <li>
                    <button
                      type="button"
                      onClick={() => setPilotModalOpen(true)}
                      className="hover:text-white dark:hover:text-[#111111] transition-colors cursor-pointer text-left"
                    >
                      Request Pilot / Contact
                    </button>
                  </li>
                  <li>
                    <a
                      href="mailto:support@papergradeai.in"
                      className="hover:text-white dark:hover:text-[#111111] transition-colors break-all"
                    >
                      support@papergradeai.in
                    </a>
                  </li>
                  <li>
                    <Link
                      href="/privacy"
                      className="hover:text-white dark:hover:text-[#111111] transition-colors"
                    >
                      Privacy Policy
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/terms"
                      className="hover:text-white dark:hover:text-[#111111] transition-colors"
                    >
                      Terms of Service
                    </Link>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          <div className="w-full overflow-hidden text-center select-none pointer-events-none pt-8 sm:pt-12 pb-4 sm:pb-2 px-2">
            <span className="text-3xl min-[360px]:text-4xl min-[440px]:text-5xl sm:text-7xl md:text-8xl lg:text-[112px] xl:text-[132px] font-black tracking-tight sm:tracking-tighter text-white/[0.14] sm:text-white/[0.06] md:text-white/[0.05] dark:text-black/[0.08] dark:sm:text-black/[0.05] uppercase select-none block leading-none whitespace-nowrap">
              PaperGrade AI
            </span>
          </div>

          <div className="max-w-5xl mx-auto w-full pt-4 border-t border-[#242422] dark:border-[#e2ded9] flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] text-[#6d6c68] dark:text-[#88847f] font-mono">
            <div>© {new Date().getFullYear()} PaperGrade AI · All rights reserved.</div>
            <div>Coaching Examination Grading Platform</div>
          </div>
        </footer>
      </div>

      <PilotInquiryModal isOpen={pilotModalOpen} onClose={() => setPilotModalOpen(false)} />
    </div>
  );
}
