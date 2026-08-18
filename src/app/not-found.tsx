import Link from "next/link";
import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="empty-state" style={{ minHeight: "65vh" }}>
      <div>
        <span className="empty-icon">
          <SearchX aria-hidden="true" />
        </span>
        <p className="eyebrow">404 · Off the schedule</p>
        <h1 className="display-title">Matchup not found</h1>
        <p className="empty-copy">
          That game is not part of this date-relative demo slate. Return to the
          desk to choose one of the next five.
        </p>
        <Button asChild className="mt-5">
          <Link href="/">Return to dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
