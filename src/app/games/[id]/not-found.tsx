import Link from "next/link";
import { CalendarX2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function GameNotFound() {
  return (
    <div className="empty-state" style={{ minHeight: "65vh" }}>
      <div>
        <span className="empty-icon">
          <CalendarX2 aria-hidden="true" />
        </span>
        <p className="eyebrow">Games board</p>
        <h1 className="display-title">Game not found</h1>
        <p className="empty-copy">
          This matchup is not on the current slate. Every upcoming fixture is on
          the games board.
        </p>
        <Button asChild className="mt-5">
          <Link href="/">Back to the games board</Link>
        </Button>
      </div>
    </div>
  );
}
