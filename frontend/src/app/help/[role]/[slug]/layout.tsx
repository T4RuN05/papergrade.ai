import type { Metadata } from "next";
import React from "react";
import { getArticleBySlug, HELP_ROLE_TRACKS, RoleId } from "@/lib/helpDocsData";
import { SITE_NAME, SITE_URL } from "@/lib/seoSchema";

interface HelpArticleLayoutProps {
  children: React.ReactNode;
  params: { role: string; slug: string };
}

export async function generateMetadata({
  params,
}: {
  params: { role: string; slug: string };
}): Promise<Metadata> {
  const role = params.role as RoleId;
  const article = getArticleBySlug(role, params.slug);
  const track = HELP_ROLE_TRACKS.find((t) => t.id === role);

  if (!article || !track) {
    return {
      title: "Guide Not Found",
      robots: { index: false, follow: false },
    };
  }

  const canonicalPath = `/help/${track.id}/${article.slug}`;
  return {
    title: `${article.title} (${article.guideCode})`,
    description: article.summary,
    alternates: {
      canonical: canonicalPath,
    },
    openGraph: {
      type: "article",
      title: `${article.title} | ${SITE_NAME}`,
      description: article.summary,
      url: `${SITE_URL}${canonicalPath}`,
    },
  };
}

export default function HelpArticleLayout({ children, params }: HelpArticleLayoutProps) {
  const role = params.role as RoleId;
  const article = getArticleBySlug(role, params.slug);
  const track = HELP_ROLE_TRACKS.find((t) => t.id === role);

  if (!article || !track) {
    return <>{children}</>;
  }

  const pageUrl = `${SITE_URL}/help/${track.id}/${article.slug}`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "TechArticle",
        headline: article.title,
        description: article.summary,
        url: pageUrl,
        author: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
        publisher: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
        inLanguage: "en-IN",
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
          { "@type": "ListItem", position: 2, name: "Help Center", item: `${SITE_URL}/help` },
          { "@type": "ListItem", position: 3, name: article.title, item: pageUrl },
        ],
      },
      ...(article.faq && article.faq.length > 0
        ? [
            {
              "@type": "FAQPage",
              mainEntity: article.faq.map((q) => ({
                "@type": "Question",
                name: q.question,
                acceptedAnswer: { "@type": "Answer", text: q.answer },
              })),
            },
          ]
        : []),
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {children}
    </>
  );
}
