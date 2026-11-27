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

const PUBLIC_PATHS = ["/", "/about", "/help", "/faq", "/privacy", "/terms"];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: PUBLIC_PATHS,
        disallow: PRIVATE_PATHS,
      },
      {
        userAgent: "Googlebot",
        allow: PUBLIC_PATHS,
        disallow: PRIVATE_PATHS,
      },
      {
        userAgent: "Google-Extended",
        allow: PUBLIC_PATHS,
        disallow: PRIVATE_PATHS,
      },
      {
        userAgent: "OAI-SearchBot",
        allow: PUBLIC_PATHS,
        disallow: PRIVATE_PATHS,
      },
      {
        userAgent: "PerplexityBot",
        allow: PUBLIC_PATHS,
        disallow: PRIVATE_PATHS,
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
