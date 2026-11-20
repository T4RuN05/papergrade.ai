import React from "react";
import { HelpSidebar } from "@/components/help/HelpSidebar";

export const metadata = {
  title: "User Manual & Help Center • PaperGrade AI",
  description: "Comprehensive step-by-step instructions and user manuals for students, teachers, and directors.",
};

export default function HelpLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col md:flex-row min-h-[calc(100vh-3.5rem)] bg-canvas-soft text-ink">
      {/* Navigation Sidebar */}
      <HelpSidebar />

      {/* Main Content Pane */}
      <div className="flex-1 min-w-0 flex justify-center py-6 sm:py-8 px-4 sm:px-8">
        <div className="w-full max-w-5xl">{children}</div>
      </div>
    </div>
  );
}
