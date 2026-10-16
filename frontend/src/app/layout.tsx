import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppShell } from "@/components/AppShell";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";

export const metadata: Metadata = {
  title: "PaperGrade AI — Academic Evaluation & Submissions",
  description: "High-integrity AI assisted academic grading, instant submissions, and transparent revaluations.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/logo-icon.png",
    shortcut: "/logo-icon.png",
    apple: "/logo-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "PaperGrade AI",
  },
};

export const viewport: Viewport = {
  themeColor: "#0075de",
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
      <body
        className="min-h-screen bg-canvas-soft text-ink font-sans selection:bg-primary selection:text-white"
        suppressHydrationWarning
      >
        <ServiceWorkerRegister />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
