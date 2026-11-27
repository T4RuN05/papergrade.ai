"use client";

import React, { useEffect, useState } from "react";
import NumberFlow, {
  NumberFlowGroup,
  continuous,
  type Format,
  type Trend,
} from "@number-flow/react";

export { NumberFlowGroup };

export interface AnimatedNumberProps {
  value: number;
  format?: Format;
  locales?: Intl.LocalesArgument;
  prefix?: string;
  suffix?: string;
  trend?: Trend;
  /** Roll through intermediate digits for small incremental counters */
  useContinuous?: boolean;
  /** Roll smoothly from 0 on initial mount (default: true) */
  animateOnMount?: boolean;
  className?: string;
}

const NOTION_TRANSFORM_TIMING: EffectTiming = {
  duration: 650,
  easing: "cubic-bezier(0.22, 1, 0.36, 1)",
};

const NOTION_SPIN_TIMING: EffectTiming = {
  duration: 650,
  easing: "cubic-bezier(0.22, 1, 0.36, 1)",
};

const NOTION_OPACITY_TIMING: EffectTiming = {
  duration: 350,
  easing: "ease-out",
};

/**
 * Lightweight, SSR-safe wrapper around `@number-flow/react` calibrated to
 * PaperGrade's Notion typography and prefers-reduced-motion rules.
 */
export function AnimatedNumber({
  value,
  format,
  locales,
  prefix,
  suffix,
  trend,
  useContinuous = false,
  animateOnMount = true,
  className = "",
}: AnimatedNumberProps) {
  const safeValue = Number.isFinite(value) ? value : 0;
  const [hasMounted, setHasMounted] = useState(false);
  const [displayValue, setDisplayValue] = useState<number>(() =>
    animateOnMount ? 0 : safeValue
  );

  useEffect(() => {
    setHasMounted(true);
  }, []);

  useEffect(() => {
    if (!hasMounted) return;
    const id = window.requestAnimationFrame(() => {
      setDisplayValue(safeValue);
    });
    return () => window.cancelAnimationFrame(id);
  }, [hasMounted, safeValue]);

  if (!hasMounted) {
    let formatted: string;
    try {
      formatted = new Intl.NumberFormat(locales, format).format(safeValue);
    } catch {
      formatted = String(safeValue);
    }
    return (
      <span className={`inline-block tabular-nums ${className}`}>
        {prefix ?? ""}
        {formatted}
        {suffix ?? ""}
      </span>
    );
  }

  return (
    <NumberFlow
      value={displayValue}
      format={format}
      locales={locales}
      prefix={prefix}
      suffix={suffix}
      trend={trend}
      plugins={useContinuous ? [continuous] : undefined}
      transformTiming={NOTION_TRANSFORM_TIMING}
      spinTiming={NOTION_SPIN_TIMING}
      opacityTiming={NOTION_OPACITY_TIMING}
      respectMotionPreference
      className={className}
    />
  );
}

interface ParsedMetric {
  value: number;
  prefix: string;
  suffix: string;
  format: Format;
  locales?: Intl.LocalesArgument;
}

function parseMetricString(raw: string): ParsedMetric | null {
  const trimmed = raw.trim();
  const match = trimmed.match(/^([₹$€£+]?)\s*(-?\d[\d,]*(?:\.\d+)?)\s*(%|ms|s|m)?$/);
  if (!match) return null;

  const [, parsedPrefix = "", rawNum, parsedSuffix = ""] = match;
  const normalizedNum = rawNum.replace(/,/g, "");
  const numericValue = Number(normalizedNum);
  if (!Number.isFinite(numericValue)) return null;

  const dotIdx = normalizedNum.indexOf(".");
  const decimals = dotIdx >= 0 ? normalizedNum.length - dotIdx - 1 : 0;

  return {
    value: numericValue,
    prefix: parsedPrefix,
    suffix: parsedSuffix,
    locales: parsedPrefix === "₹" ? "en-IN" : undefined,
    format: {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
      useGrouping: rawNum.includes(","),
    },
  };
}

export interface AnimatedMetricValueProps {
  value?: string | number | null;
  className?: string;
  format?: Format;
  locales?: Intl.LocalesArgument;
  prefix?: string;
  suffix?: string;
  trend?: Trend;
  animateOnMount?: boolean;
  useContinuous?: boolean;
}

export function AnimatedMetricValue({
  value,
  className = "",
  format,
  locales,
  prefix,
  suffix,
  trend,
  animateOnMount = true,
  useContinuous = false,
}: AnimatedMetricValueProps) {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return <span className={className}>—</span>;
    }
    const inferredFormat: Format =
      format ??
      (Number.isInteger(value)
        ? { maximumFractionDigits: 0 }
        : { minimumFractionDigits: 1, maximumFractionDigits: 2 });

    return (
      <AnimatedNumber
        value={value}
        format={inferredFormat}
        locales={locales}
        prefix={prefix}
        suffix={suffix}
        trend={trend}
        animateOnMount={animateOnMount}
        useContinuous={useContinuous}
        className={`tabular-nums ${className}`}
      />
    );
  }

  if (typeof value === "string") {
    const parsed = parseMetricString(value);
    if (parsed) {
      return (
        <AnimatedNumber
          value={parsed.value}
          format={format ?? parsed.format}
          locales={locales ?? parsed.locales}
          prefix={prefix ?? (parsed.prefix || undefined)}
          suffix={suffix ?? (parsed.suffix || undefined)}
          trend={trend}
          animateOnMount={animateOnMount}
          useContinuous={useContinuous}
          className={`tabular-nums ${className}`}
        />
      );
    }
  }

  return <span className={className}>{value}</span>;
}
