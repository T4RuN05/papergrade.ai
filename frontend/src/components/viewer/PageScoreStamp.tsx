"use client";

import React from "react";

interface PageScoreStampProps {
  totalScore: number;
  totalMax: number;
  scorePct: number;
  invScale: number;
}

export function PageScoreStamp({
  totalScore,
  totalMax,
  scorePct,
  invScale,
}: PageScoreStampProps) {
  return (
    <div
      className="absolute top-2 right-2 sm:top-4 sm:right-4 z-20 pointer-events-none select-none rounded-md sm:rounded-lg border sm:border-2 border-red-600/90 bg-white/95 px-2 py-1 sm:px-4 sm:py-2 shadow-sm text-left border-dashed"
      style={{
        transformOrigin: "top right",
        transform: `scale(${invScale})`,
      }}
    >
      <div className="text-[9px] sm:text-[10px] font-semibold text-red-700">
        Total Marks
      </div>
      <div className="text-sm sm:text-3xl font-black text-red-600 font-mono tracking-tight leading-none mt-0.5">
        {totalScore}{" "}
        <span className="text-[10px] sm:text-base text-red-600/70 font-normal">
          / {totalMax}
        </span>
      </div>
      <div className="text-[8px] sm:text-[10px] font-bold text-red-700 mt-0.5">
        {scorePct}% Score
      </div>
    </div>
  );
}
