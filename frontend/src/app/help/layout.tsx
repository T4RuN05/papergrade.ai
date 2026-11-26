import React from "react";
import { HelpScrollToTopButton } from "@/components/help/HelpScrollToTopButton";

export const metadata = {
  title: "User Manual & Help Center • PaperGrade AI",
  description:
    "Comprehensive step-by-step instructions and user manuals for students, teachers, and administrators.",
};

export default function HelpLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-canvas-soft text-ink relative">
      {children}
      <HelpScrollToTopButton />
    </div>
  );
}
