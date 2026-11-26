"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  GraduationCap,
  Users,
  Building2,
  Search,
  BookOpen,
  ChevronDown,
  ChevronLeft,
  X,
  Menu,
} from "lucide-react";
import { HELP_ROLE_TRACKS } from "@/lib/helpDocsData";

const iconMap = {
  GraduationCap,
  Users,
  Building2,
};

export interface HelpSidebarProps {
  currentGuideCode?: string;
  currentRoleBadge?: string;
}

export function HelpSidebar({ currentGuideCode, currentRoleBadge }: HelpSidebarProps = {}) {
  const pathname = usePathname();
  const [searchFilter, setSearchFilter] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsedTracks, setCollapsedTracks] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && mobileOpen) {
        setMobileOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mobileOpen]);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    const activeTrack = HELP_ROLE_TRACKS.find((track) =>
      track.articles.some((a) => pathname === `/help/${track.id}/${a.slug}`)
    );
    if (activeTrack) {
      setCollapsedTracks((prev) => {
        if (!prev[activeTrack.id]) return prev;
        return { ...prev, [activeTrack.id]: false };
      });
    }
  }, [pathname]);

  const toggleTrack = (id: string) => {
    setCollapsedTracks((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const filteredTracks = HELP_ROLE_TRACKS.map((track) => {
    if (!searchFilter.trim()) return track;
    const clean = searchFilter.toLowerCase();
    const matchingArticles = track.articles.filter(
      (a) =>
        a.title.toLowerCase().includes(clean) ||
        a.guideCode.toLowerCase().includes(clean) ||
        a.summary.toLowerCase().includes(clean)
    );
    return { ...track, articles: matchingArticles };
  });

  const renderTrackList = (onNavigate?: () => void) => (
    <div className="space-y-4 flex-1">
      {filteredTracks.map((track) => {
        const Icon = iconMap[track.iconName];
        const isCollapsed = searchFilter.trim() ? false : Boolean(collapsedTracks[track.id]);

        return (
          <div key={track.id} className="space-y-1">
            <button
              type="button"
              onClick={() => toggleTrack(track.id)}
              className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-sm hover:bg-canvas-soft text-left transition-colors cursor-pointer"
              aria-expanded={!isCollapsed}
            >
              <div className="flex items-center gap-2 min-w-0">
                <Icon className="h-4 w-4 text-ink-muted shrink-0" />
                <span className="text-xs font-semibold text-ink truncate">{track.badge}</span>
              </div>
              <ChevronDown
                className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 ${
                  isCollapsed ? "-rotate-90 text-ink-faint" : "rotate-0 text-ink-muted"
                }`}
              />
            </button>

            <div
              className={`grid transition-all duration-200 ease-in-out ${
                isCollapsed
                  ? "grid-rows-[0fr] opacity-0 pointer-events-none"
                  : "grid-rows-[1fr] opacity-100"
              }`}
            >
              <div className="overflow-hidden space-y-0.5 pl-1">
                {track.articles.length === 0 ? (
                  <p className="text-xs text-ink-muted px-2.5 py-1.5">No matching guides.</p>
                ) : (
                  track.articles.map((article) => {
                    const href = `/help/${track.id}/${article.slug}`;
                    const isActive = pathname === href;

                    return (
                      <Link
                        key={article.id}
                        href={href}
                        onClick={onNavigate}
                        className={`flex items-start gap-2 px-2.5 py-1.5 rounded-sm text-xs leading-snug transition-colors ${
                          isActive
                            ? "bg-primary/[0.09] text-primary font-semibold"
                            : "text-ink-secondary hover:text-ink hover:bg-canvas-soft"
                        }`}
                      >
                        <span
                          className={`font-mono text-[11px] shrink-0 tabular-nums mt-px ${
                            isActive ? "text-primary" : "text-ink-faint"
                          }`}
                        >
                          {article.guideCode}
                        </span>
                        <span className="line-clamp-2 min-w-0">{article.title}</span>
                      </Link>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <>
      {/* Mobile Compact Sticky Chapter Bar */}
      <div className="md:hidden sticky top-14 z-30 flex items-center justify-between gap-2 px-4 h-11 bg-surface/95 backdrop-blur-sm border-b border-hairline">
        <div className="flex items-center gap-2 min-w-0">
          <Link
            href="/help"
            className="inline-flex items-center gap-1 text-xs font-medium text-ink-muted hover:text-ink transition-colors shrink-0"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            <span>Manual</span>
          </Link>
          {currentGuideCode && (
            <>
              <span className="text-ink-faint text-xs">/</span>
              <span className="inline-flex items-center gap-1.5 min-w-0">
                <span className="font-mono text-[11px] font-semibold text-primary px-1.5 py-0.5 rounded-xs bg-canvas-soft border border-hairline shrink-0">
                  {currentGuideCode}
                </span>
                {currentRoleBadge && (
                  <span className="text-xs text-ink-muted truncate">{currentRoleBadge}</span>
                )}
              </span>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="notion-btn-utility min-h-[28px] h-7 px-2.5 text-xs shrink-0"
          aria-label="Open chapters menu"
        >
          <Menu className="h-3.5 w-3.5 text-ink-muted" />
          <span>Chapters</span>
        </button>
      </div>

      {/* Mobile Drawer */}
      <div
        className={`fixed inset-0 z-50 md:hidden transition-all duration-300 ease-in-out ${
          mobileOpen ? "visible pointer-events-auto" : "invisible pointer-events-none"
        }`}
        aria-hidden={!mobileOpen}
      >
        <div
          className={`fixed inset-0 bg-black/45 backdrop-blur-sm transition-opacity duration-300 ${
            mobileOpen ? "opacity-100" : "opacity-0"
          }`}
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />

        <div
          className={`fixed inset-y-0 left-0 w-[85vw] max-w-xs h-[100dvh] bg-surface border-r border-hairline shadow-notion-modal flex flex-col p-4 transition-transform duration-300 ease-out transform select-none ${
            mobileOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex items-center justify-between pb-3 border-b border-hairline shrink-0">
            <Link
              href="/help"
              onClick={() => setMobileOpen(false)}
              className="flex items-center gap-2 text-xs font-semibold text-ink hover:text-primary transition-colors"
            >
              <BookOpen className="h-4 w-4 text-primary shrink-0" />
              <span>Help Center Home</span>
            </Link>
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="p-1.5 rounded-md text-ink-muted hover:text-ink hover:bg-canvas-soft transition-colors cursor-pointer"
              aria-label="Close chapters menu"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="relative my-3 shrink-0">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-muted pointer-events-none" />
            <input
              type="text"
              placeholder="Filter chapters..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="w-full bg-canvas-soft border border-hairline rounded-xs pl-8 pr-7 py-1.5 text-xs text-ink placeholder:text-ink-faint focus:outline-none focus:border-primary"
            />
            {searchFilter && (
              <button
                type="button"
                onClick={() => setSearchFilter("")}
                aria-label="Clear filter"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto sleek-scrollbar pr-1">
            {renderTrackList(() => setMobileOpen(false))}
          </div>
        </div>
      </div>

      {/* Desktop Sticky Left Sidebar */}
      <aside className="hidden md:flex flex-col w-64 xl:w-[272px] shrink-0 border-r border-hairline bg-surface h-[calc(100vh-3.5rem)] sticky top-14 overflow-y-auto sleek-scrollbar p-4 select-none">
        <div className="pb-3 border-b border-hairline mb-3 space-y-1">
          <Link
            href="/help"
            className="inline-flex items-center gap-2 text-xs font-semibold text-ink hover:text-primary transition-colors"
          >
            <ChevronLeft className="h-3.5 w-3.5 text-ink-muted" />
            <span>Help Center</span>
          </Link>
          <p className="text-xs text-ink-muted pl-5">User Manual & Guides</p>
        </div>

        <div className="relative mb-4">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-muted pointer-events-none" />
          <input
            type="text"
            placeholder="Filter chapters..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="w-full bg-canvas-soft border border-hairline rounded-xs pl-8 pr-7 py-1.5 text-xs text-ink placeholder:text-ink-faint focus:outline-none focus:border-primary transition-colors"
          />
          {searchFilter && (
            <button
              type="button"
              onClick={() => setSearchFilter("")}
              aria-label="Clear filter"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {renderTrackList()}
      </aside>
    </>
  );
}
