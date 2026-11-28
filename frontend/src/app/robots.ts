import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seoSchema";

const PRIVATE_PATHS = [
  "/admin/",
  "/overview",
  "/exams/",
  "/batches/",
  "/branch/",
  "/grading/",
  "/marks",
  "/analytics",
  "/revaluation",
  "/settings",
  "/notifications",
  "/results/",
  "/student/",
  "/auth/",
  "/api/",
];

const PUBLIC_PATHS = [
  "/",
  "/about",
  "/help",
  "/faq",
  "/privacy",
  "/terms",
  "/llms.txt",
  "/favicon.ico",
  "/icon-192.png",
  "/icon-512.png",
  "/og-image.png",
];

const AI_AND_SEARCH_BOTS = [
  "*",
  "Googlebot",
  "Google-Extended",
  "Google-CloudVertexBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "GPTBot",
  "PerplexityBot",
  "ClaudeBot",
  "Claude-SearchBot",
  "Applebot",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: AI_AND_SEARCH_BOTS.map((userAgent) => ({
      userAgent,
      allow: PUBLIC_PATHS,
      disallow: PRIVATE_PATHS,
    })),
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
