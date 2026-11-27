"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  GraduationCap,
  Users,
  Building2,
  Search,
  ArrowRight,
  Clock,
  Camera,
  KeyRound,
  FileSpreadsheet,
  HardDrive,
  ShieldCheck,
  X,
  BookOpen,
  ChevronRight,
} from "lucide-react";
import { HELP_ROLE_TRACKS, RoleId, searchHelpDocs } from "@/lib/helpDocsData";

const trackIcons = {
  GraduationCap,
  Users,
  Building2,
};

type RoleFilter = "all" | RoleId;

const ROLE_TABS: Array<{ id: RoleFilter; label: string }> = [
  { id: "all", label: "All Guides" },
  { id: "student", label: "Student Guide" },
  { id: "faculty", label: "Faculty Guide" },
  { id: "director", label: "Admin Guide" },
];

export default function HelpHubPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRole, setSelectedRole] = useState<RoleFilter>("all");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const roleParam = new URLSearchParams(window.location.search).get("role");
    if (roleParam === "student" || roleParam === "faculty" || roleParam === "director") {
      setSelectedRole(roleParam);
    }
  }, []);

  const handleRoleChange = (role: RoleFilter) => {
    setSelectedRole(role);
    if (typeof window !== "undefined") {
      const url = role === "all" ? "/help" : `/help?role=${role}`;
      window.history.replaceState(null, "", url);
    }
  };

  const totalChapters = useMemo(
    () => HELP_ROLE_TRACKS.reduce((sum, track) => sum + track.articles.length, 0),
    []
  );

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const results = searchHelpDocs(searchQuery);
    if (selectedRole === "all") return results;
    return results.filter((article) => article.role === selectedRole);
  }, [searchQuery, selectedRole]);

  const popularShortcuts = useMemo(
    () => [
      {
        title: "Scanning Answer Sheets & Replacing Pages",
        role: "student" as RoleId,
        slug: "taking-exams-and-scanning",
        guideCode: "S-02",
        roleLabel: "Student",
        icon: Camera,
      },
      {
        title: "Resetting a Forgotten Password",
        role: "student" as RoleId,
        slug: "student-password-recovery",
        guideCode: "S-05",
        roleLabel: "Student",
        icon: KeyRound,
      },
      {
        title: "Account Settings & Google Drive Backup",
        role: "student" as RoleId,
        slug: "account-settings-and-drive-backup",
        guideCode: "S-06",
        roleLabel: "Student",
        icon: HardDrive,
      },
      {
        title: "Opening Live Submission Windows & Extensions",
        role: "faculty" as RoleId,
        slug: "submission-windows-and-extensions",
        guideCode: "F-04",
        roleLabel: "Faculty",
        icon: Clock,
      },
      {
        title: "Ranked Standings, Marks Matrix & Exports",
        role: "faculty" as RoleId,
        slug: "publishing-and-marks-matrix",
        guideCode: "F-06",
        roleLabel: "Faculty",
        icon: FileSpreadsheet,
      },
      {
        title: "Batch Evaluation & Publishing Results",
        role: "director" as RoleId,
        slug: "platform-governance-and-operations",
        guideCode: "D-04",
        roleLabel: "Admin",
        icon: ShieldCheck,
      },
    ],
    []
  );

  const visibleShortcuts = useMemo(() => {
    if (selectedRole === "all") return popularShortcuts;
    return popularShortcuts.filter((s) => s.role === selectedRole);
  }, [popularShortcuts, selectedRole]);

  const activeTrack = useMemo(() => {
    if (selectedRole === "all") return null;
    return HELP_ROLE_TRACKS.find((t) => t.id === selectedRole) || null;
  }, [selectedRole]);

  const trackMetaById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const t of HELP_ROLE_TRACKS) {
      map[t.id] = t.badge;
    }
    return map;
  }, []);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10 space-y-8 sm:space-y-10 pb-16">
      {/* Editorial Header */}
      <header className="pb-6 border-b border-hairline space-y-5">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
            <span className="notion-eyebrow text-ink-muted">Official User Manual</span>
            <span className="text-ink-faint">·</span>
            <span className="tabular-nums">{totalChapters} chapters</span>
          </div>
          <h1 className="notion-heading-2 text-2xl sm:text-[32px] text-ink">
            PaperGrade AI Help Center
          </h1>
          <p className="text-sm text-ink-muted max-w-2xl leading-relaxed">
            Clear, step-by-step guides for students, teachers, branch managers, and institute administrators.
          </p>
        </div>

        {/* Search & Role Switcher */}
        <div className="space-y-3">
          <div className="relative max-w-xl">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-muted pointer-events-none" />
            <input
              type="text"
              placeholder="Search guides by topic, keyword, or code (e.g. camera, rubric, S-02)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-surface border border-hairline rounded-md pl-9 pr-9 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:border-primary transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                aria-label="Clear search"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-xs text-ink-muted hover:text-ink transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Role Switcher Tabs (uniform 2x2 on mobile, inline tray on sm+) */}
          <div
            role="tablist"
            aria-label="Filter manuals by role"
            className="grid grid-cols-2 sm:inline-flex gap-1.5 p-1 rounded-lg bg-surface border border-hairline w-full sm:w-auto"
          >
            {ROLE_TABS.map((tab) => {
              const isSelected = selectedRole === tab.id;
              const count =
                tab.id === "all"
                  ? totalChapters
                  : HELP_ROLE_TRACKS.find((t) => t.id === tab.id)?.articles.length ?? 0;

              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  onClick={() => handleRoleChange(tab.id)}
                  className={`inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                    isSelected
                      ? "bg-primary text-on-primary"
                      : "text-ink-secondary hover:text-ink hover:bg-canvas-soft"
                  }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`text-[11px] tabular-nums ${
                      isSelected ? "text-white/80" : "text-ink-faint"
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {/* Active Search Results */}
      {searchQuery.trim() ? (
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="notion-section-title text-base sm:text-lg text-ink">
              Search results{" "}
              <span className="text-ink-muted font-normal tabular-nums">
                ({searchResults.length})
              </span>
            </h2>
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="text-xs font-medium text-primary hover:text-primary-active cursor-pointer"
            >
              Clear search
            </button>
          </div>

          {searchResults.length === 0 ? (
            <div className="p-8 rounded-lg border border-hairline bg-surface text-center space-y-2">
              <BookOpen className="h-6 w-6 text-ink-faint mx-auto" />
              <p className="text-sm font-medium text-ink">No guides found</p>
              <p className="text-xs text-ink-muted">
                Nothing matched &ldquo;{searchQuery}&rdquo;. Try another keyword or switch to All Guides.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {searchResults.map((article) => (
                <Link
                  key={article.id}
                  href={`/help/${article.role}/${article.slug}`}
                  className="group p-4 rounded-lg border border-hairline bg-surface hover:border-ink-faint transition-colors flex flex-col justify-between gap-3 shadow-notion-card"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2 text-xs text-ink-muted">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-mono text-[11px] font-semibold text-primary px-1.5 py-0.5 rounded-xs bg-canvas-soft border border-hairline shrink-0">
                          {article.guideCode}
                        </span>
                        <span className="truncate">{trackMetaById[article.role]}</span>
                      </div>
                      <span className="tabular-nums shrink-0">{article.readTimeMinutes} min</span>
                    </div>
                    <h3 className="text-sm font-semibold text-ink group-hover:text-primary transition-colors leading-snug">
                      {article.title}
                    </h3>
                    <p className="text-xs text-ink-muted line-clamp-2 leading-relaxed">
                      {article.summary}
                    </p>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-hairline-subtle text-xs text-ink-muted">
                    <span>{article.steps.length} steps</span>
                    <span className="inline-flex items-center gap-1 font-medium text-primary">
                      <span>Read guide</span>
                      <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      ) : (
        <>
          {/* Quick Shortcuts */}
          {visibleShortcuts.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="notion-section-title text-base sm:text-lg text-ink">
                  Frequently used guides
                </h2>
                <span className="text-xs text-ink-muted hidden sm:inline">
                  Jump to common workflows
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {visibleShortcuts.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.guideCode}
                      href={`/help/${item.role}/${item.slug}`}
                      className="group p-3.5 rounded-lg border border-hairline bg-surface hover:border-ink-faint transition-colors flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-8 w-8 rounded-md bg-canvas-soft border border-hairline flex items-center justify-center text-ink-secondary shrink-0">
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-ink group-hover:text-primary transition-colors truncate">
                            {item.title}
                          </p>
                          <p className="text-[11px] text-ink-muted mt-0.5 flex items-center gap-1.5">
                            <span className="font-mono">{item.guideCode}</span>
                            <span className="text-ink-faint">·</span>
                            <span>{item.roleLabel}</span>
                          </p>
                        </div>
                      </div>
                      <ArrowRight className="h-3.5 w-3.5 text-ink-faint group-hover:text-primary shrink-0 transition-transform group-hover:translate-x-0.5" />
                    </Link>
                  );
                })}
              </div>
            </section>
          )}

          {/* All Roles Symmetrical 3-Column Grid OR Focused Role Chapter Grid */}
          {activeTrack ? (
            <section className="space-y-4">
              {(() => {
                const TrackIcon = trackIcons[activeTrack.iconName];
                return (
                  <>
                    <div className="p-5 rounded-lg border border-hairline bg-surface flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-notion-card">
                      <div className="flex items-start gap-3.5 min-w-0">
                        <div className="h-10 w-10 rounded-md bg-canvas-soft border border-hairline flex items-center justify-center text-ink-secondary shrink-0">
                          <TrackIcon className="h-5 w-5" />
                        </div>
                        <div className="space-y-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h2 className="notion-section-title text-base sm:text-lg text-ink">
                              {activeTrack.label}
                            </h2>
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-canvas-soft border border-hairline text-ink-muted tabular-nums">
                              {activeTrack.articles.length} chapters
                            </span>
                          </div>
                          <p className="text-xs sm:text-sm text-ink-muted leading-relaxed">
                            {activeTrack.description}
                          </p>
                        </div>
                      </div>
                      <Link
                        href={`/help/${activeTrack.id}/${activeTrack.articles[0].slug}`}
                        className="notion-btn-primary shrink-0 self-start sm:self-center"
                      >
                        <span>Start chapter 1</span>
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {activeTrack.articles.map((article) => (
                        <Link
                          key={article.id}
                          href={`/help/${activeTrack.id}/${article.slug}`}
                          className="group p-4 sm:p-5 rounded-lg border border-hairline bg-surface hover:border-ink-faint transition-colors flex flex-col justify-between gap-3 shadow-notion-card"
                        >
                          <div className="space-y-2">
                            <div className="flex items-center justify-between gap-2 text-xs text-ink-muted">
                              <span className="font-mono text-[11px] font-semibold text-primary px-1.5 py-0.5 rounded-xs bg-canvas-soft border border-hairline">
                                {article.guideCode}
                              </span>
                              <span className="inline-flex items-center gap-1 tabular-nums">
                                <Clock className="h-3 w-3" />
                                <span>{article.readTimeMinutes} min read</span>
                              </span>
                            </div>
                            <h3 className="text-sm sm:text-[15px] font-semibold text-ink group-hover:text-primary transition-colors leading-snug">
                              {article.title}
                            </h3>
                            <p className="text-xs text-ink-muted leading-relaxed line-clamp-2">
                              {article.summary}
                            </p>
                          </div>

                          <div className="flex items-center justify-between pt-2.5 border-t border-hairline-subtle text-xs text-ink-muted">
                            <span className="tabular-nums">{article.steps.length} steps</span>
                            <span className="inline-flex items-center gap-1 font-medium text-primary">
                              <span>Open chapter</span>
                              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                            </span>
                          </div>
                        </Link>
                      ))}
                    </div>
                  </>
                );
              })()}
            </section>
          ) : (
            <section className="space-y-4">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="notion-section-title text-base sm:text-lg text-ink">
                  Manuals by role
                </h2>
                <span className="text-xs text-ink-muted tabular-nums">
                  3 guides · {totalChapters} chapters
                </span>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
                {HELP_ROLE_TRACKS.map((track) => {
                  const Icon = trackIcons[track.iconName];
                  return (
                    <div
                      key={track.id}
                      className="bg-surface border border-hairline rounded-lg p-5 flex flex-col justify-between gap-5 shadow-notion-card"
                    >
                      <div className="space-y-4">
                        <div className="flex items-center justify-between gap-2">
                          <div className="h-9 w-9 rounded-md bg-canvas-soft border border-hairline flex items-center justify-center text-ink-secondary">
                            <Icon className="h-5 w-5" />
                          </div>
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-canvas-soft border border-hairline text-ink-muted tabular-nums">
                            {track.articles.length} chapters
                          </span>
                        </div>

                        <div className="space-y-1">
                          <h3 className="text-base font-semibold text-ink leading-snug">
                            {track.label}
                          </h3>
                          <p className="text-xs text-ink-muted leading-relaxed">
                            {track.description}
                          </p>
                        </div>

                        <div className="border-t border-hairline pt-3 space-y-0.5">
                          {track.articles.map((art) => (
                            <Link
                              key={art.id}
                              href={`/help/${track.id}/${art.slug}`}
                              className="group flex items-center justify-between gap-2 px-2 py-1.5 -mx-2 rounded-sm text-xs text-ink-secondary hover:text-primary hover:bg-canvas-soft transition-colors"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="font-mono text-[11px] text-ink-faint group-hover:text-primary shrink-0 tabular-nums">
                                  {art.guideCode}
                                </span>
                                <span className="truncate">{art.title}</span>
                              </div>
                              <ChevronRight className="h-3.5 w-3.5 text-ink-faint opacity-0 group-hover:opacity-100 group-hover:text-primary shrink-0 transition-opacity" />
                            </Link>
                          ))}
                        </div>
                      </div>

                      <Link
                        href={`/help/${track.id}/${track.articles[0].slug}`}
                        className="notion-btn-utility w-full justify-between px-3 py-2 text-xs font-medium"
                      >
                        <span>Open {track.badge} Guide</span>
                        <ArrowRight className="h-3.5 w-3.5 text-ink-muted" />
                      </Link>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
