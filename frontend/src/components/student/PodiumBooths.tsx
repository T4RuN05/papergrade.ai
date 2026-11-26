"use client";

import React from "react";
import { Trophy, Medal, Award } from "lucide-react";
import type { ExamRankedItem } from "../ExamRankedTable";

export type RankedEntryWithStats = ExamRankedItem & {
  rank: number;
  percentile: number;
  isCurrentStudent: boolean;
  effectiveMaxMarks: number;
  effectiveScore: number;
  effectivePercentage: number;
};

interface PodiumBoothsProps {
  rankedAll: RankedEntryWithStats[];
  maxMarks: number;
  isFetching?: boolean;
  currentUserGooglePicture?: string | null;
  hideTargetStudentAvatar?: boolean;
  setTargetAvatarEl?: (el: HTMLDivElement | null) => void;
  justSettledFromMorph?: boolean;
}

interface RankTheme {
  rank: 1 | 2 | 3;
  orderClass: string;
  boothHeightClass: string;
  avatarSizeClass: string;
  frontBgClass: string;
  lidBgClass: string;
  bevelClass: string;
  badgeClass: string;
  avatarRingClass: string;
  cloudTintClass: string;
  glowClass: string;
  Icon: typeof Trophy;
  label: string;
  riseDelayMs: number;
  avatarDelayMs: number;
}

const RANK_THEMES: Record<1 | 2 | 3, RankTheme> = {
  3: {
    rank: 3,
    orderClass: "order-3",
    boothHeightClass: "h-[58px] sm:h-[64px]",
    avatarSizeClass: "h-7 w-7 sm:h-8 sm:w-8 text-[10px] sm:text-xs",
    frontBgClass:
      "bg-gradient-to-b from-[#f6f1eb] via-[#ece3d8] to-[#e1d4c5] dark:from-[#261e17] dark:via-[#1e1711] dark:to-[#17120d]",
    lidBgClass:
      "bg-gradient-to-b from-[#fdfaf6] to-[#f0e6da] dark:from-[#382b20] dark:to-[#281f17]",
    bevelClass:
      "border-[#d8c9b6] dark:border-[#3e2f23] shadow-[inset_0_1px_0_rgba(255,255,255,0.8),inset_-4px_0_8px_rgba(139,101,66,0.06),0_8px_16px_-6px_rgba(0,0,0,0.18)] dark:shadow-[inset_0_1px_0_rgba(255,214,180,0.1),inset_-4px_0_8px_rgba(0,0,0,0.3),0_10px_18px_-6px_rgba(0,0,0,0.55)]",
    badgeClass:
      "text-[#6e4e31] dark:text-[#c4ae97] bg-white/75 dark:bg-black/30 border-[#dccbb8] dark:border-[#463628]",
    avatarRingClass:
      "ring-[#c4a78b] dark:ring-[#6b5039] bg-[#f4ece3] dark:bg-[#241c15] text-[#594532] dark:text-[#d1b9a1]",
    cloudTintClass:
      "border-[#dfd1c1] dark:border-[#3c2d21]",
    glowClass: "from-amber-700/15 via-transparent to-transparent dark:from-amber-700/10",
    Icon: Award,
    label: "3rd",
    riseDelayMs: 60,
    avatarDelayMs: 560,
  },
  2: {
    rank: 2,
    orderClass: "order-1",
    boothHeightClass: "h-[74px] sm:h-[82px]",
    avatarSizeClass: "h-7 w-7 sm:h-8 sm:w-8 text-[10px] sm:text-xs",
    frontBgClass:
      "bg-gradient-to-b from-[#f4f3f1] via-[#eae8e4] to-[#dfddd8] dark:from-[#262626] dark:via-[#1e1e1e] dark:to-[#171717]",
    lidBgClass:
      "bg-gradient-to-b from-[#ffffff] to-[#edece9] dark:from-[#363636] dark:to-[#272727]",
    bevelClass:
      "border-[#d5d2cc] dark:border-[#323232] shadow-[inset_0_1px_0_rgba(255,255,255,0.85),inset_-4px_0_8px_rgba(0,0,0,0.04),0_8px_16px_-6px_rgba(0,0,0,0.18)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.12),inset_-4px_0_8px_rgba(0,0,0,0.28),0_10px_18px_-6px_rgba(0,0,0,0.55)]",
    badgeClass:
      "text-[#57534e] dark:text-[#b8b5b0] bg-white/75 dark:bg-black/30 border-[#dcd9d3] dark:border-[#3a3a3a]",
    avatarRingClass:
      "ring-[#c8c5be] dark:ring-[#525252] bg-[#efeeec] dark:bg-[#262626] text-[#44403c] dark:text-[#d6d3d1]",
    cloudTintClass:
      "border-[#dcdad4] dark:border-[#343434]",
    glowClass: "from-slate-300/20 via-transparent to-transparent dark:from-slate-400/10",
    Icon: Medal,
    label: "2nd",
    riseDelayMs: 380,
    avatarDelayMs: 880,
  },
  1: {
    rank: 1,
    orderClass: "order-2",
    boothHeightClass: "h-[92px] sm:h-[102px]",
    avatarSizeClass: "h-8 w-8 sm:h-10 sm:w-10 text-xs sm:text-sm",
    frontBgClass:
      "bg-gradient-to-b from-[#fdf8ef] via-[#f6ebd7] to-[#ebdac0] dark:from-[#2c2013] dark:via-[#22180e] dark:to-[#19110a]",
    lidBgClass:
      "bg-gradient-to-b from-[#fffdf8] to-[#f9efd9] dark:from-[#42301b] dark:to-[#2e2112]",
    bevelClass:
      "border-[#dfc9a6] dark:border-[#4b341c] shadow-[inset_0_1px_0_rgba(255,255,255,0.95),inset_-4px_0_10px_rgba(176,123,48,0.08),0_12px_22px_-6px_rgba(176,123,48,0.22)] dark:shadow-[inset_0_1px_0_rgba(255,222,168,0.18),inset_-4px_0_10px_rgba(0,0,0,0.35),0_12px_24px_-6px_rgba(0,0,0,0.65)]",
    badgeClass:
      "text-[#8b5e20] dark:text-[#e5ad68] bg-white/80 dark:bg-black/35 border-[#e4cfa9] dark:border-[#52391d]",
    avatarRingClass:
      "ring-[#d8b174] dark:ring-[#b88642] bg-[#faf2e3] dark:bg-[#2a1f12] text-[#7a4e18] dark:text-[#f2c482]",
    cloudTintClass:
      "border-[#e6d3b3] dark:border-[#48321b]",
    glowClass: "from-amber-400/20 via-transparent to-transparent dark:from-amber-400/12",
    Icon: Trophy,
    label: "1st",
    riseDelayMs: 700,
    avatarDelayMs: 1200,
  },
};

function formatFirstNamesCloud(students: RankedEntryWithStats[]): string {
  if (students.length === 0) return "";
  if (students.length === 1) {
    const parts = (students[0].student_name || "Student").trim().split(/\s+/);
    if (parts.length <= 1) return parts[0];
    return `${parts[0]} ${parts[1].charAt(0)}.`;
  }
  const firsts = students.slice(0, 2).map((s) => (s.student_name || "Student").trim().split(/\s+/)[0]);
  if (students.length === 2) {
    return `${firsts[0]} & ${firsts[1]}`;
  }
  return `${firsts[0]}, ${firsts[1]} +${students.length - 2}`;
}

export function PodiumBooths({
  rankedAll,
  maxMarks,
  isFetching = false,
  currentUserGooglePicture,
  hideTargetStudentAvatar = false,
  setTargetAvatarEl,
  justSettledFromMorph = false,
}: PodiumBoothsProps) {
  const groups = React.useMemo(() => {
    const byRank: Record<1 | 2 | 3, RankedEntryWithStats[]> = { 1: [], 2: [], 3: [] };
    for (const entry of rankedAll) {
      if (entry.rank === 1 || entry.rank === 2 || entry.rank === 3) {
        byRank[entry.rank].push(entry);
      }
    }
    return byRank;
  }, [rankedAll]);

  // Display order: 2nd (left), 1st (center), 3rd (right)
  const orderedRanks: (1 | 2 | 3)[] = [2, 1, 3];

  return (
    <div
      className={`relative w-full rounded-2xl border border-hairline bg-gradient-to-b from-canvas-soft/65 via-surface to-surface px-2.5 sm:px-4 pt-3 pb-2.5 shadow-2xs overflow-hidden transition-opacity duration-200 ${
        isFetching ? "opacity-75" : "opacity-100"
      }`}
    >
      {/* Subtle overhead ambient glow matching active theme */}
      <div
        className="pointer-events-none absolute inset-x-10 top-0 h-16 bg-gradient-to-b from-amber-500/[0.06] via-primary/[0.03] to-transparent blur-xl"
        aria-hidden="true"
      />

      <div className="relative grid grid-cols-3 items-end gap-2 sm:gap-3.5 min-h-[164px] sm:min-h-[182px]">
        {orderedRanks.map((rankNum) => {
          const theme = RANK_THEMES[rankNum];
          const students = groups[rankNum];
          const hasStudents = students.length > 0;
          const score = hasStudents ? students[0].effectiveScore : null;
          const effectiveMax = hasStudents ? students[0].effectiveMaxMarks : maxMarks;
          const IconComponent = theme.Icon;
          const visibleAvatars = students.slice(0, 3);
          const extraCount = Math.max(0, students.length - 3);
          const hasCurrentStudent = students.some((s) => s.isCurrentStudent);

          return (
            <div
              key={rankNum}
              className={`${theme.orderClass} flex flex-col items-center justify-end min-w-0`}
            >
              {/* Floating Name Cloud Pill + Avatar Stack */}
              {hasStudents ? (
                <div className="flex flex-col items-center mb-1 min-w-0 w-full">
                  {/* Small Cloud Name Pill */}
                  <div
                    style={{ animationDelay: `${theme.avatarDelayMs + 90}ms` }}
                    title={students.map((s) => s.student_name).join(", ")}
                    className={`animate-podium-cloud relative max-w-full inline-flex items-center gap-1 px-2 py-0.5 mb-1.5 rounded-full bg-surface/95 border ${theme.cloudTintClass} shadow-[0_2px_8px_-2px_rgba(0,0,0,0.12)] dark:shadow-[0_3px_10px_-2px_rgba(0,0,0,0.5)]`}
                  >
                    <span className="text-[9.5px] sm:text-[10.5px] font-semibold text-ink truncate max-w-[78px] sm:max-w-[126px] leading-tight">
                      {formatFirstNamesCloud(students)}
                    </span>
                    {hasCurrentStudent && (
                      <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" title="You" />
                    )}
                    {/* Tiny cloud pointer nub */}
                    <span
                      className={`absolute -bottom-[3.5px] left-1/2 -translate-x-1/2 h-1.5 w-1.5 rotate-45 bg-surface border-r border-b ${theme.cloudTintClass}`}
                      aria-hidden="true"
                    />
                  </div>

                  {/* Clustered Profile Pictures */}
                  <div
                    className={`flex items-center justify-center ${
                      visibleAvatars.length > 1 ? "-space-x-2" : ""
                    }`}
                  >
                    {visibleAvatars.map((stu, idx) => {
                      const picUrl =
                        stu.google_picture ||
                        (stu.isCurrentStudent ? currentUserGooglePicture : null);
                      const initial = (stu.student_name || "S").trim().charAt(0).toUpperCase();
                      const isMorphTarget = stu.isCurrentStudent;
                      const skipPopAnim = isMorphTarget && (hideTargetStudentAvatar || justSettledFromMorph);

                      return (
                        <div
                          key={stu.id}
                          ref={isMorphTarget ? setTargetAvatarEl : undefined}
                          style={{
                            zIndex: visibleAvatars.length - idx,
                            ...(skipPopAnim ? {} : { animationDelay: `${theme.avatarDelayMs + idx * 70}ms` }),
                          }}
                          title={`${stu.student_name} (${stu.effectiveScore.toFixed(1)}/${stu.effectiveMaxMarks})`}
                          className={`relative ${theme.avatarSizeClass} rounded-full overflow-hidden flex items-center justify-center font-bold select-none shadow-sm transition-opacity duration-150 ${
                            skipPopAnim ? "" : "animate-podium-avatar"
                          } ${
                            stu.isCurrentStudent
                              ? "ring-2 ring-primary ring-offset-1 ring-offset-surface"
                              : `ring-2 ${theme.avatarRingClass}`
                          } ${
                            isMorphTarget && hideTargetStudentAvatar ? "opacity-0" : "opacity-100"
                          } ${
                            isMorphTarget && justSettledFromMorph ? "animate-podium-settle-pulse" : ""
                          }`}
                        >
                          {picUrl ? (
                            <img
                              src={picUrl}
                              alt={stu.student_name}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <span>{initial}</span>
                          )}
                        </div>
                      );
                    })}

                    {extraCount > 0 && (
                      <div
                        style={{ animationDelay: `${theme.avatarDelayMs + 180}ms` }}
                        className={`animate-podium-avatar ${theme.avatarSizeClass} rounded-full ring-2 ring-surface bg-canvas-soft text-ink-secondary font-mono font-bold flex items-center justify-center text-[9px] shadow-xs`}
                        title={`${extraCount} more tied at #${rankNum}`}
                      >
                        +{extraCount}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="mb-2 h-7 flex items-center justify-center">
                  <span className="text-[9.5px] font-medium text-ink-faint">—</span>
                </div>
              )}

              {/* Pure CSS 3D Architectural Booth Pedestal */}
              <div
                style={{ animationDelay: `${theme.riseDelayMs}ms` }}
                className="animate-podium-rise w-full flex flex-col items-stretch group"
              >
                {/* 3D Top Bevel Surface (Extruded Lid) */}
                <div
                  className={`h-2.5 sm:h-3 w-full border-t border-x border-b-0 ${theme.bevelClass} ${theme.lidBgClass}`}
                  style={{
                    clipPath: "polygon(6% 0%, 94% 0%, 100% 100%, 0% 100%)",
                  }}
                  aria-hidden="true"
                />

                {/* Front Vertical Face */}
                <div
                  className={`relative ${theme.boothHeightClass} w-full rounded-b-lg border ${theme.bevelClass} ${theme.frontBgClass} flex flex-col items-center justify-center gap-1 py-1.5 sm:py-2 px-1.5 overflow-hidden`}
                >
                  {/* Subtle top specular reflection */}
                  <div
                    className={`pointer-events-none absolute inset-x-0 top-0 h-6 bg-gradient-to-b ${theme.glowClass}`}
                    aria-hidden="true"
                  />

                  {/* Subtle Trophy/Medal/Award Badge */}
                  <span
                    className={`relative z-10 inline-flex items-center gap-1 px-1.5 py-[1px] rounded text-[9px] sm:text-[10px] font-bold border leading-tight ${theme.badgeClass}`}
                  >
                    <IconComponent className="h-2.5 w-2.5 sm:h-3 sm:w-3 shrink-0" />
                    <span>{theme.label}</span>
                  </span>

                  {/* Student Marks on Booth Front Face */}
                  <div className="relative z-10 flex items-baseline justify-center gap-0.5 leading-tight">
                    <span className="font-mono font-bold text-ink text-xs sm:text-sm tracking-tight">
                      {score !== null ? score.toFixed(1) : "—"}
                    </span>
                    {score !== null && (
                      <span className="font-mono text-[8.5px] sm:text-[9.5px] text-ink-muted">
                        /{effectiveMax}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
