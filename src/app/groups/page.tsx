import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { UsersRound } from "lucide-react";
import { listGroupsForUser } from "@/data/groups-repository";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { requireAccount } from "@/lib/auth";

export const dynamic = "force-dynamic";
// Client router cache, page-scoped. See src/app/games/[id]/page.tsx.
export const unstable_dynamicStaleTime = 300;
export const metadata: Metadata = { title: "Groups" };

export default async function Page() {
  const account = await requireAccount();
  if (!account.ok && account.reason === "unconfigured") {
    return (
      <>
        <header className="page-heading">
          <div>
            <p className="eyebrow">Group wagers</p>
            <h1 className="display-title">Groups</h1>
          </div>
        </header>
        <div className="empty-state">
          <div>
            <span className="empty-icon">
              <UsersRound aria-hidden="true" />
            </span>
            <h3 className="empty-title">Sign-in is not configured</h3>
            <p className="empty-copy">
              This environment has no auth provider configured, so there are no
              groups to show.
            </p>
          </div>
        </div>
      </>
    );
  }
  if (!account.ok) redirect("/sign-in?callbackUrl=/groups");

  const groups = await listGroupsForUser(account.userId);

  return (
    <>
      <header className="page-heading">
        <div>
          <p className="eyebrow">Group wagers</p>
          <h1 className="display-title">Groups</h1>
          <p className="page-description">
            Place free-to-play wagers with people you know and see who has
            called it best over time.
          </p>
        </div>
        <Button asChild>
          <Link href="/groups/new">New group</Link>
        </Button>
      </header>

      {groups.length === 0 ? (
        <div className="empty-state">
          <div>
            <span className="empty-icon">
              <UsersRound aria-hidden="true" />
            </span>
            <h3 className="empty-title">No groups yet</h3>
            <p className="empty-copy">
              Create a group to place wagers together and track the record.
            </p>
            <Button asChild className="mt-5">
              <Link href="/groups/new">New group</Link>
            </Button>
          </div>
        </div>
      ) : (
        <div className="section-grid">
          {groups.map((group) => (
            <Card
              key={group.id}
              title={group.name}
              titleId={`group-${group.id}`}
            >
              <div className="form-block">
                <span>
                  {group.role === "owner"
                    ? "You created this group."
                    : "Member."}
                </span>
                <Button asChild variant="secondary" size="sm">
                  <Link href={`/groups/${group.slug}`}>Open</Link>
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
