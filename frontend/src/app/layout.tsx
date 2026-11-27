import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
  display: "swap",
});
import { AppShell } from "@/components/AppShell";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { IOSInstallBanner } from "@/components/iOSInstallBanner";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { ThemeProvider } from "@/lib/ThemeContext";
import { QueryProvider } from "@/lib/QueryProvider";
import { buildRootJsonLdGraph, SITE_NAME, SITE_URL } from "@/lib/seoSchema";

const ROOT_DESCRIPTION =
  "AI-assisted handwritten subjective answer sheet grading for coaching institutes. Lock step-marking rubrics, inspect bounding-box citations, publish ranked standings, and resolve student appeals cleanly.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "PaperGrade AI — Handwritten Exam Grading for Coaching Institutes",
    template: "%s | PaperGrade AI",
  },
  description: ROOT_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    "PaperGrade AI",
    "papergradeai",
    "AI answer sheet grading",
    "handwritten exam evaluation software",
    "coaching institute test checking AI",
    "rubric based subjective grading",
    "step marking AI Physics Chemistry Maths",
    "automated answer booklet checking India",
    "student revaluation portal",
  ],
  authors: [{ name: SITE_NAME, url: SITE_URL }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "en_IN",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: "PaperGrade AI — Handwritten Exam Grading for Coaching Institutes",
    description: ROOT_DESCRIPTION,
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "PaperGrade AI — Handwritten Answer Sheet Evaluation & Rubric Grading",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "PaperGrade AI — Handwritten Exam Grading for Coaching Institutes",
    description: ROOT_DESCRIPTION,
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: "/icon-192.png",
    apple: "/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "PaperGrade AI",
    startupImage: [
      {
        url: "/landing-logo.png",
      },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f5f4" },
    { media: "(prefers-color-scheme: dark)", color: "#191919" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var stored = localStorage.getItem('papergrade_theme');
                  var isDark = stored === 'dark' || (!stored && window.matchMedia('(prefers-color-scheme: dark)').matches);
                  var root = document.documentElement;
                  if (isDark) {
                    root.classList.add('dark');
                    root.style.backgroundColor = '#191919';
                  } else {
                    root.classList.remove('dark');
                    root.style.backgroundColor = '#f6f5f4';
                  }
                  var manifestTag = document.querySelector('link[rel="manifest"]');
                  if (manifestTag) {
                    manifestTag.href = isDark ? '/manifest-dark.webmanifest' : '/manifest.webmanifest';
                  }
                  var themeMeta = document.querySelector('meta[name="theme-color"]');
                  if (themeMeta) {
                    themeMeta.content = isDark ? '#191919' : '#f6f5f4';
                  }
                } catch (e) {}
              })();
            `,
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(buildRootJsonLdGraph()),
          }}
        />
      </head>
      <body
        className="min-h-screen bg-canvas-soft text-ink font-sans selection:bg-primary selection:text-white"
        suppressHydrationWarning
      >
        <ThemeProvider>
          <QueryProvider>
            <ServiceWorkerRegister />
            <IOSInstallBanner />
            <AppShell>{children}</AppShell>
            <Analytics />
            <SpeedInsights />
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
