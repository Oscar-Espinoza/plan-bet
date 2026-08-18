"use client";

import Link from "next/link";
import {
  Activity,
  Bookmark,
  CheckCheck,
  ClipboardCheck,
  Eye,
  FileText,
  History,
  ListChecks,
  Users,
} from "lucide-react";
import { DemoStamp } from "@/components/demo-stamp";
import { LocalDateTime } from "@/components/local-date-time";
import { Button } from "@/components/ui/button";
import { getActivityTotals, type ActivityEvent } from "@/lib/storage";
import { isLegacyBaseballGameId } from "@/lib/game-ids";
import { getTeam } from "@/lib/seed";
import { useMatchdayStore } from "@/lib/store";

const eventIcons: Record<ActivityEvent["type"], typeof Activity> = {
  team_selected: Users,
  watchlist_created: ListChecks,
  watchlist_updated: ClipboardCheck,
  watchlist_completed: CheckCheck,
  watchlist_reopened: History,
  watchlist_deleted: ListChecks,
  recap_saved: FileText,
  briefing_viewed: Eye,
  briefing_saved: Bookmark,
  briefing_removed: Bookmark,
};

export function ActivityPage() {
  const store = useMatchdayStore();
  const totals = getActivityTotals(store);
  const metrics = [
    { label: "Briefs viewed", value: totals.briefingsViewed, icon: Eye },
    { label: "Briefs saved", value: totals.briefingsSaved, icon: Bookmark },
    { label: "Watchlist", value: totals.watchlistItems, icon: ListChecks },
    { label: "Completed", value: totals.completedItems, icon: CheckCheck },
    { label: "Recaps", value: totals.recaps, icon: FileText },
  ];

  return (
    <>
      <header className="page-heading">
        <div>
          <p className="eyebrow">Browser-local record</p>
          <h1 className="display-title">Activity</h1>
          <p className="page-description">
            Exact totals from the successful actions in this demo. No account,
            tracking profile, or cross-device sync is involved.
          </p>
        </div>
        <DemoStamp />
      </header>
      <section className="metric-grid" aria-label="Activity totals">
        {metrics.map((metric) => (
          <div className="metric-card panel" key={metric.label}>
            <metric.icon aria-hidden="true" size={17} />
            <strong>{metric.value}</strong>
            <span>{metric.label}</span>
          </div>
        ))}
      </section>
      <section className="panel" aria-labelledby="history-heading">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Newest first</p>
            <h2 className="panel-title" id="history-heading">
              Action history
            </h2>
          </div>
          <span className="fine-print">Up to 100 events</span>
        </div>
        {store.activityEvents.length ? (
          <ol className="activity-list">
            {store.activityEvents.map((activity) => {
              const Icon = eventIcons[activity.type];
              const team = activity.teamSlug
                ? getTeam(activity.teamSlug)
                : undefined;
              return (
                <li key={activity.id}>
                  <span className="activity-icon">
                    <Icon aria-hidden="true" size={16} />
                  </span>
                  <div>
                    <strong>{activity.label}</strong>
                    <p>
                      {team?.name ?? "Matchday Plan"} ·{" "}
                      <LocalDateTime value={activity.at} />
                    </p>
                  </div>
                  {activity.gameId && (
                    <Link href={`/games/${activity.gameId}`}>
                      {isLegacyBaseballGameId(activity.gameId)
                        ? "View archived demo"
                        : "View game"}
                    </Link>
                  )}
                </li>
              );
            })}
          </ol>
        ) : (
          <div className="empty-state">
            <div>
              <span className="empty-icon">
                <Activity aria-hidden="true" />
              </span>
              <h3 className="empty-title">No activity yet</h3>
              <p className="empty-copy">
                Open a demo brief, add a watchlist item, or save a recap.
                Successful actions will appear here in order.
              </p>
              <Button asChild variant="secondary" size="sm" className="mt-4">
                <Link href="/">Explore upcoming games</Link>
              </Button>
            </div>
          </div>
        )}
      </section>
    </>
  );
}
