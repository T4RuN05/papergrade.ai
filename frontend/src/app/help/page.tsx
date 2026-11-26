"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  GraduationCap,
  Users,
  Building2,
  Search,
  BookOpen,
  ArrowRight,
  Clock,
  Sparkles,
  Camera,
  RotateCcw,
  KeyRound,
  FileSpreadsheet,
  HardDrive,
  ShieldCheck,
} from "lucide-react";
import { HELP_ROLE_TRACKS, searchHelpDocs } from "@/lib/helpDocsData";
import { FeatureCard, BadgePill } from "@/components/ui";

const trackIcons = {
  GraduationCap,
  Users,
  Building2,
};

export default function HelpHubPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const searchResults = searchQuery.trim() ? searchHelpDocs(searchQuery) : [];

  const popularShortcuts = [
    {
      title: "Scanning Answer Sheets & Replacing Pages",
      role: "student",
      slug: "taking-exams-and-scanning",
      guideCode: "S-02",
      icon: Camera,
    },
    {
      title: "Resetting a Forgotten Password",
      role: "student",
      slug: "student-password-recovery",
      guideCode: "S-05",
      icon: KeyRound,
    },
    {
      title: "Account Settings, Active Devices & Google Drive Backup",
      role: "student",
      slug: "account-settings-and-drive-backup",
      guideCode: "S-06",
      icon: HardDrive,
    },
    {
      title: "Opening Live Submission Windows & Adding Extra Time",
      role: "faculty",
      slug: "submission-windows-and-extensions",
      guideCode: "F-04",
      icon: Clock,
    },
    {
      title: "Ranked Standings, Class Marks Matrix & Exports",
      role: "faculty",
      slug: "publishing-and-marks-matrix",
      guideCode: "F-06",
      icon: FileSpreadsheet,
    },
    {
      title: "Overnight Evaluation & Publishing Results",
      role: "director",
      slug: "platform-governance-and-operations",
      guideCode: "D-04",
      icon: ShieldCheck,
    },
  ];

  return (
    <div className="space-y-8 pb-12 animate-in fade-in duration-200">
      {/* Hero Banner */}
      <div className="space-y-3 text-center sm:text-left">
        <div className="flex items-center justify-center sm:justify-start gap-2">
          <BadgePill label="Documentation & Guides" color="purple" />
          <span className="text-xs text-ink-muted">• Official User Manual</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-ink tracking-tight">
          How can we help you today?
        </h1>
        <p className="text-xs sm:text-sm text-ink-muted max-w-2xl leading-relaxed">
          Comprehensive, step-by-step guides for students, teachers, and administrators. Learn how to scan papers, manage submission windows, and review grades.
        </p>

        {/* Global Search Bar */}
        <div className="relative max-w-xl pt-2">
          <Search className="absolute left-3.5 top-5 h-4 w-4 text-ink-muted" />
          <input
            type="text"
            placeholder="Search all guides (e.g. camera, replace sheet, password, windows)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-surface border border-hairline rounded-xl pl-10 pr-4 py-2.5 text-xs sm:text-sm text-ink placeholder:text-ink-muted focus:outline-hidden focus:border-primary shadow-2xs"
          />
        </div>
      </div>

      {/* Search Results Display (if active) */}
      {searchQuery.trim() && (
        <div className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-ink-muted">
            Search Results ({searchResults.length})
          </h2>
          {searchResults.length === 0 ? (
            <div className="p-6 rounded-xl border border-hairline bg-surface text-center">
              <p className="text-xs text-ink-muted">No guides found matching "{searchQuery}". Try different keywords.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {searchResults.map((article) => (
                <Link
                  key={article.id}
                  href={`/help/${article.role}/${article.slug}`}
                  className="p-3.5 rounded-xl border border-hairline bg-surface hover:bg-canvas-soft transition-all space-y-1 block shadow-2xs"
                >
                  <div className="flex items-center justify-between text-xs font-bold text-ink">
                    <span>{article.title}</span>
                    <span className="font-mono text-[10px] text-ink-muted bg-canvas-soft border border-hairline px-1.5 py-0.5 rounded">
                      {article.guideCode}
                    </span>
                  </div>
                  <p className="text-[11px] text-ink-muted line-clamp-2 leading-relaxed">
                    {article.summary}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Popular Shortcuts */}
      {!searchQuery.trim() && (
        <div className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-ink-muted">
            Frequently Used Guides
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {popularShortcuts.map((item, idx) => {
              const Icon = item.icon;
              return (
                <Link
                  key={idx}
                  href={`/help/${item.role}/${item.slug}`}
                  className="p-3 rounded-lg border border-hairline bg-surface hover:bg-canvas-soft transition-all flex items-center justify-between gap-3 text-xs font-semibold text-ink group shadow-2xs"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="h-7 w-7 rounded-md bg-canvas-soft border border-hairline flex items-center justify-center text-primary shrink-0">
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <span className="truncate text-xs">{item.title}</span>
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 text-ink-muted group-hover:text-primary shrink-0 transition-transform group-hover:translate-x-0.5" />
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* 3 Main Role Track Cards */}
      <div className="space-y-4">
        <h2 className="text-xs font-bold uppercase tracking-wider text-ink-muted">
          Manuals by User Role
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {HELP_ROLE_TRACKS.map((track) => {
            const Icon = trackIcons[track.iconName];
            return (
              <FeatureCard key={track.id} className="p-5 flex flex-col justify-between space-y-4 shadow-2xs">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="h-9 w-9 rounded-xl bg-canvas-soft border border-hairline flex items-center justify-center text-primary">
                      <Icon className="h-5 w-5" />
                    </div>
                    <BadgePill label={track.badge} color="sky" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-ink">{track.label}</h3>
                    <p className="text-xs text-ink-muted mt-1 leading-relaxed">
                      {track.description}
                    </p>
                  </div>

                  <div className="border-t border-hairline pt-3 space-y-1">
                    {track.articles.map((art) => (
                      <Link
                        key={art.id}
                        href={`/help/${track.id}/${art.slug}`}
                        className="flex items-center gap-2 py-1 text-xs text-ink-secondary hover:text-primary transition-colors truncate"
                      >
                        <span className="font-mono text-[10px] text-ink-muted shrink-0">{art.guideCode}</span>
                        <span className="truncate">{art.title}</span>
                      </Link>
                    ))}
                  </div>
                </div>

                <Link
                  href={`/help/${track.id}/${track.articles[0].slug}`}
                  className="inline-flex items-center justify-center gap-1.5 w-full py-2 rounded-lg bg-surface border border-hairline hover:bg-canvas-soft text-xs font-semibold text-ink transition-colors"
                >
                  <span>Open {track.badge} Guide</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </FeatureCard>
            );
          })}
        </div>
      </div>
    </div>
  );
}
