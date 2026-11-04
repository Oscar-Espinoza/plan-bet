"use client";
import { useTranslation } from "@/components/language-provider";
import { cn } from "@/lib/utils";

// Tone is also carried in color alone (border/background/text), which is not
// available to a screen reader. This prefixes a plain-language qualifier so
// the same distinction survives non-visually, without changing the visible tag.
const TONE_LABELS: Record<string, string> = {
  positive: "Positive: ",
  warning: "Warning: ",
  negative: "Negative: ",
};

export function StatusTag({
  children,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode;
  tone?: "neutral" | "positive" | "warning" | "negative";
  className?: string;
}) {
  const { t } = useTranslation();
  const toneLabel = TONE_LABELS[tone];
  return (
    <span className={cn("status-tag", `status-${tone}`, className)}>
      {toneLabel && <span className="sr-only">{t(toneLabel)}</span>}
      {children}
    </span>
  );
}
