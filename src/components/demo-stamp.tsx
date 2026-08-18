import { CircleDot } from "lucide-react";
import { demoGeneratedAt } from "@/lib/seed";

export function DemoStamp({ compact = false }: { compact?: boolean }) {
  return (
    <div className="demo-stamp" title={`Generated ${demoGeneratedAt}`}>
      <CircleDot aria-hidden="true" size={12} />
      <span>Demo snapshot</span>
      {!compact && (
        <time dateTime={demoGeneratedAt}>· Generated daily at 10:00 UTC</time>
      )}
    </div>
  );
}
