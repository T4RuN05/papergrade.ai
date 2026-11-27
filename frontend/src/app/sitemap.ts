import type { MetadataRoute } from "next";
import { HELP_ROLE_TRACKS } from "@/lib/helpDocsData";
import { SITE_URL } from "@/lib/seoSchema";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: `${SITE_URL}/`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1.0,
    },
    {
      url: `${SITE_URL}/about`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/faq`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.85,
    },
    {
      url: `${SITE_URL}/help`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/privacy`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${SITE_URL}/terms`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];

  const helpArticleRoutes: MetadataRoute.Sitemap = HELP_ROLE_TRACKS.flatMap((track) =>
    track.articles.map((article) => ({
      url: `${SITE_URL}/help/${track.id}/${article.slug}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.75,
    }))
  );

  return [...staticRoutes, ...helpArticleRoutes];
}
