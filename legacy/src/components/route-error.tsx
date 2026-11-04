"use client";
import { useTranslation } from "@/components/language-provider";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * One error boundary shape shared by the root and per-segment error.tsx
 * files. Each caller supplies its own title and copy — the copy is a node,
 * not a string, because a next action is a link, and principle 5 says an
 * error screen cannot dead-end without one.
 */
export function RouteError({
  title,
  copy,
  reset,
}: {
  title: string;
  copy: React.ReactNode;
  reset: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="empty-state" style={{ minHeight: "65vh" }}>
      <div>
        <span className="empty-icon">
          <AlertTriangle aria-hidden="true" />
        </span>
        <p className="eyebrow">{t("Something went wrong")}</p>
        <h1 className="display-title">
          {typeof title === "string" ? t(title) : title}
        </h1>
        <p className="empty-copy">
          {typeof copy === "string" ? t(copy) : copy}
        </p>
        <Button className="mt-5" onClick={reset}>
          {t("Try again")}{" "}
        </Button>
      </div>
    </div>
  );
}
