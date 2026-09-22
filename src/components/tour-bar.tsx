"use client";
import { useTranslation } from "@/components/language-provider";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useBandHeight } from "@/components/action-bar";
import { Button } from "@/components/ui/button";
import { useMatchdayStore } from "@/lib/store";

// Steps are pages, not elements — no anchoring, no refs, no position math.
// Step 0 and 2 are observed here from the pathname; step 1 (a wager placed)
// is the one thing this bar cannot see, so bet-slip.tsx calls advanceTour(2)
// itself, beside its own success branch.
const STEPS = [
  "Start here — pick any game from the board.",
  "Tap a price to back a side, set a stake, place it.",
  "That's it. See where you stand on You.",
];

export function TourBar() {
  const { t } = useTranslation();
  const pathname = usePathname();
  const tourRef = useBandHeight("--tour-h");
  const hydrated = useMatchdayStore((state) => state.hydrated);
  const tourStep = useMatchdayStore((state) => state.tourStep);
  const advanceTour = useMatchdayStore((state) => state.advanceTour);
  const finishTour = useMatchdayStore((state) => state.finishTour);

  useEffect(() => {
    if (!hydrated) return;
    if (pathname.startsWith("/games/")) advanceTour(1);
    else if (pathname === "/you") finishTour();
  }, [hydrated, pathname, advanceTour, finishTour]);

  if (!hydrated || tourStep >= STEPS.length) return null;

  return (
    <div
      ref={tourRef}
      className="tour-bar"
      role="region"
      aria-label={t("Getting started tour")}
    >
      <p className="tour-bar-copy">
        <span className="tour-bar-count">
          {tourStep + 1} {t("of")} {STEPS.length}
        </span>
        {t(STEPS[tourStep])}
      </p>
      <Button
        variant="secondary"
        size="sm"
        onClick={finishTour}
        aria-label={t("Skip the tour")}
      >
        {t("Skip")}{" "}
      </Button>
    </div>
  );
}
