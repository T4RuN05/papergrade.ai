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
  X,
  Menu,
} from "lucide-react";
import { HELP_ROLE_TRACKS } from "@/lib/helpDocsData";

const iconMap = {
  GraduationCap,
  Users,
  Building2,
};

export function HelpSidebar() {
  const pathname = usePathname();
  const [searchFilter, setSearchFilter] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsedTracks, setCollapsedTracks] = useState<Record<string, boolean>>({});

  // Lock body scroll while mobile drawer is open to prevent background scrolling
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

  // Handle Escape key to close mobile menu
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && mobileOpen) {
        setMobileOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mobileOpen]);

  // Auto-close mobile drawer on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Ensure active track is expanded when viewing a guide
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

  return (
    <>
      {/* Mobile Sticky Bar */}
      <div className="md:hidden sticky top-14 z-20 flex items-center justify-between px-4 py-2.5 bg-surface/90 backdrop-blur-md border-b border-hairline">
        <Link href="/help" className="flex items-center gap-2 text-xs font-bold text-ink">
          <BookOpen className="h-4 w-4 text-primary" />
          <span>PaperGrade User Manual</span>
        </Link>
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-hairline bg-surface hover:bg-canvas-soft text-xs font-semibold text-ink transition-colors cursor-pointer"
          aria-label="Open Guides Menu"
        >
          <Menu className="h-3.5 w-3.5 text-ink-muted" />
          <span>Guides Menu</span>
        </button>
      </div>

      {/* Mobile Drawer with Smooth Opening & Closing Animation */}
      <div
        className={`fixed inset-0 z-50 md:hidden transition-all duration-300 ease-in-out ${
          mobileOpen ? "visible pointer-events-auto" : "invisible pointer-events-none"
        }`}
        aria-hidden={!mobileOpen}
      >
        {/* Scrim Backdrop with smooth fade in/out */}
        <div
          className={`fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity duration-300 ease-in-out ${
            mobileOpen ? "opacity-100" : "opacity-0"
          }`}
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />

        {/* Sliding Drawer Panel */}
        <div
          className={`fixed inset-y-0 left-0 w-4/5 max-w-xs h-full h-[100dvh] bg-surface border-r border-hairline shadow-2xl flex flex-col p-4 transition-transform duration-300 ease-in-out transform select-none ${
            mobileOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex items-center justify-between pb-3 border-b border-hairline shrink-0">
            <Link
              href="/help"
              onClick={() => setMobileOpen(false)}
              className="flex items-center gap-2 text-xs font-bold text-ink"
            >
              <BookOpen className="h-4 w-4 text-primary" />
              <span>User Manual</span>
            </Link>
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="p-1.5 rounded-md text-ink-muted hover:text-ink hover:bg-canvas-soft transition-colors cursor-pointer"
              aria-label="Close Guides Menu"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Search inside mobile drawer */}
          <div className="relative my-3 shrink-0">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-ink-muted" />
            <input
              type="text"
              placeholder="Search guides..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="w-full bg-canvas-soft border border-hairline rounded-md pl-8 pr-2.5 py-1.5 text-xs text-ink placeholder:text-ink-muted focus:outline-hidden focus:border-primary/50"
            />
          </div>

          {/* Scrollable list of tracks */}
          <div className="flex-1 overflow-y-auto space-y-3 pr-1">
            {filteredTracks.map((track) => {
              const Icon = iconMap[track.iconName];
              const isCollapsed = Boolean(collapsedTracks[track.id]);

              return (
                <div key={track.id} className="space-y-1">
                  <button
                    type="button"
                    onClick={() => toggleTrack(track.id)}
                    className="w-full flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-canvas-soft text-left transition-colors cursor-pointer"
                    aria-expanded={!isCollapsed}
                  >
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4 text-primary shrink-0" />
                      <span className="text-xs font-bold text-ink">{track.label}</span>
                    </div>
                    <ChevronDown
                      className={`h-3.5 w-3.5 transition-transform duration-200 transform ${
                        isCollapsed ? "-rotate-90 text-ink-faint" : "rotate-0 text-ink-muted"
                      }`}
                    />
                  </button>

                  <div
                    className={`grid transition-all duration-200 ease-in-out ${
                      isCollapsed ? "grid-rows-[0fr] opacity-0 pointer-events-none" : "grid-rows-[1fr] opacity-100"
                    }`}
                  >
                    <div className="overflow-hidden pl-4 space-y-0.5 pt-0.5">
                      {track.articles.map((article) => {
                        const href = `/help/${track.id}/${article.slug}`;
                        const isActive = pathname === href;
                        return (
                          <Link
                            key={article.id}
                            href={href}
                            onClick={() => setMobileOpen(false)}
                            className={`block px-2.5 py-1.5 rounded-md text-xs transition-colors ${
                              isActive
                                ? "bg-primary text-white font-semibold shadow-2xs"
                                : "text-ink-muted hover:text-ink hover:bg-canvas-soft"
                            }`}
                          >
                            <span
                              className={`font-mono text-[10px] mr-1.5 ${
                                isActive ? "text-white/80" : "text-ink-faint"
                              }`}
                            >
                              {article.guideCode}
                            </span>
                            <span className="line-clamp-1">{article.title}</span>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Desktop Persistent Left Sidebar */}
      <aside className="hidden md:flex flex-col w-72 shrink-0 border-r border-hairline bg-surface/50 h-[calc(100vh-3.5rem)] sticky top-14 overflow-y-auto p-4 select-none">
        {/* Help Center Header Link */}
        <div className="pb-3 border-b border-hairline mb-3">
          <Link
            href="/help"
            className="flex items-center gap-2 text-xs font-bold text-ink hover:text-primary transition-colors"
          >
            <BookOpen className="h-4 w-4 text-primary" />
            <span>PaperGrade User Manual</span>
          </Link>
          <p className="text-[11px] text-ink-muted mt-0.5">
            Role-tailored platform instructions
          </p>
        </div>

        {/* Search input */}
        <div className="relative mb-4">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-ink-muted" />
          <input
            type="text"
            placeholder="Search guides (e.g. camera, reset)..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="w-full bg-canvas-soft border border-hairline rounded-md pl-8 pr-2.5 py-1.5 text-xs text-ink placeholder:text-ink-muted focus:outline-hidden focus:border-primary/50"
          />
        </div>

        {/* Track Groups */}
        <div className="space-y-4 flex-1">
          {filteredTracks.map((track) => {
            const Icon = iconMap[track.iconName];
            const isCollapsed = Boolean(collapsedTracks[track.id]);

            return (
              <div key={track.id} className="space-y-1">
                <button
                  type="button"
                  onClick={() => toggleTrack(track.id)}
                  className="w-full flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-canvas-soft text-left transition-colors cursor-pointer group"
                  aria-expanded={!isCollapsed}
                >
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-primary shrink-0 transition-transform duration-200 group-hover:scale-105" />
                    <span className="text-xs font-bold text-ink">{track.label}</span>
                  </div>
                  <ChevronDown
                    className={`h-3.5 w-3.5 transition-transform duration-200 transform ${
                      isCollapsed ? "-rotate-90 text-ink-faint" : "rotate-0 text-ink-muted"
                    }`}
                  />
                </button>

                <div
                  className={`grid transition-all duration-200 ease-in-out ${
                    isCollapsed ? "grid-rows-[0fr] opacity-0 pointer-events-none" : "grid-rows-[1fr] opacity-100"
                  }`}
                >
                  <div className="overflow-hidden space-y-0.5 pt-0.5">
                    {track.articles.length === 0 ? (
                      <p className="text-[11px] text-ink-muted px-3 py-1">No guides match search.</p>
                    ) : (
                      track.articles.map((article) => {
                        const href = `/help/${track.id}/${article.slug}`;
                        const isActive = pathname === href;

                        return (
                          <Link
                            key={article.id}
                            href={href}
                            className={`flex items-start gap-1.5 px-3 py-1.5 rounded-md text-xs leading-relaxed transition-colors ${
                              isActive
                                ? "bg-primary text-white font-semibold shadow-2xs"
                                : "text-ink-muted hover:text-ink hover:bg-canvas-soft"
                            }`}
                          >
                            <span
                              className={`font-mono text-[10px] shrink-0 mt-0.5 ${
                                isActive ? "text-white/80" : "text-ink-faint"
                              }`}
                            >
                              {article.guideCode}
                            </span>
                            <span className="line-clamp-2">{article.title}</span>
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
      </aside>
    </>
  );
}
