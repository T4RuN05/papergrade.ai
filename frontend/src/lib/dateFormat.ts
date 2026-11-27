/**
 * Minimalist exam date formatting & extraction utilities shared across
 * admin/staff consoles, student cards, and PDF viewers.
 */

export function resolveExamDate(source: any): string | null {
  if (!source || typeof source !== "object") return null;
  const candidate =
    source.exam_date ||
    source.exam?.exam_date ||
    source.window_status?.opened_at ||
    source.exam?.created_at ||
    source.exam_created_at ||
    source.created_at ||
    source.submitted_at ||
    null;
  return typeof candidate === "string" && candidate.trim() ? candidate.trim() : null;
}

export function formatExamDate(
  isoDate?: string | null,
  options?: { includeYear?: boolean; fallback?: string }
): string {
  const fallback = options?.fallback ?? "";
  if (!isoDate) return fallback;
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) return fallback;

  const includeYear = options?.includeYear ?? true;
  return parsed.toLocaleDateString(
    undefined,
    includeYear
      ? { month: "short", day: "numeric", year: "numeric" }
      : { month: "short", day: "numeric" }
  );
}
