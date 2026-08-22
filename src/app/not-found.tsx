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
          That page does not exist. The games board has every upcoming fixture
          across soccer and baseball.
        </p>
        <Button asChild className="mt-5">
          <Link href="/">Back to the games board</Link>
        </Button>
      </div>
    </div>
  );
}
