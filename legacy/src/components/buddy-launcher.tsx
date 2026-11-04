"use client";

import { useTranslation } from "@/components/language-provider";
import { lazy, Suspense, useState } from "react";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMatchdayStore } from "@/lib/store";

function Opening() {
  const { t } = useTranslation();
  return (
    <Button
      variant="secondary"
      size="sm"
      className="buddy-launcher"
      disabled
      aria-busy="true"
    >
      {t("Opening Buddy…")}
    </Button>
  );
}

const Dialog = lazy(() =>
  import("./buddy").then((module) => ({ default: module.Buddy })),
);

export function Buddy() {
  const hydrated = useMatchdayStore((state) => state.hydrated);
  const [opened, setOpened] = useState(false);
  if (!hydrated) return null;
  if (opened)
    return (
      <Suspense fallback={<Opening />}>
        <Dialog initiallyOpen />
      </Suspense>
    );
  return (
    <Button
      variant="secondary"
      size="sm"
      className="buddy-launcher"
      onClick={() => setOpened(true)}
    >
      <MessageCircle aria-hidden="true" size={15} />
      Buddy
    </Button>
  );
}
