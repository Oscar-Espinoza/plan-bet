"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useMatchdayStore } from "@/lib/store";

/**
 * The app never said what it was for — the fictional-credits line lived at
 * the bottom of the footer. This carries both halves (what it is, and the
 * disclaimer) at the entry point, once, and stays gone once dismissed: the
 * footer's one-line legal statement is the permanent record, so nothing is
 * lost by dismissing. `hydrated` gate mirrors TourBar's — it is what keeps
 * a stored dismissal from flashing the banner before localStorage loads.
 */
export function IntroBanner() {
  const hydrated = useMatchdayStore((state) => state.hydrated);
  const dismissed = useMatchdayStore((state) => state.introDismissed);
  const dismissIntro = useMatchdayStore((state) => state.dismissIntro);

  if (!hydrated || dismissed) return null;

  return (
    <div
      className="banner intro-banner"
      role="region"
      aria-label="About Matchday Plan"
    >
      <p>
        <strong>Practice your calls on real fixtures.</strong> Pick a game, back
        a side with fictional credits, and watch how your read ages. Not a
        sportsbook — credits cannot be bought, transferred, or withdrawn.{" "}
        <Link href="/rules">How it works</Link>
      </p>
      <Button
        variant="ghost"
        size="sm"
        onClick={dismissIntro}
        aria-label="Dismiss this introduction"
      >
        Dismiss
      </Button>
    </div>
  );
}
