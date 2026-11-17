import LogoLoader from "@/components/LogoLoader/LogoLoader";

export default function Loading() {
  return (
    <div className="flex min-h-[70vh] w-full flex-col items-center justify-center space-y-4">
      <LogoLoader size={84} duration={2.0} label="Loading PaperGrade AI" />
    </div>
  );
}
