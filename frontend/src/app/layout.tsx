import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppShell } from "@/components/AppShell";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { Analytics } from "@vercel/analytics/react";
import { ThemeProvider } from "@/lib/ThemeContext";
import { QueryProvider } from "@/lib/QueryProvider";

export const metadata: Metadata = {
  title: "PaperGrade AI — Academic Evaluation & Submissions",
  description: "High-integrity AI assisted academic grading, instant submissions, and transparent revaluations.",
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
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
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
      </head>
      <body
        className="min-h-screen bg-canvas-soft text-ink font-sans selection:bg-primary selection:text-white"
        suppressHydrationWarning
      >
        <ThemeProvider>
          <QueryProvider>
            <ServiceWorkerRegister />
            <AppShell>{children}</AppShell>
            <Analytics />
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
