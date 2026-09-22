import { GroupList } from "@/components/group-list";
import { getTranslation } from "@/lib/locale-server";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus, UsersRound } from "lucide-react";
import { listGroupsForUser } from "@/data/groups-repository";
import { Button } from "@/components/ui/button";
import { requireAccount } from "@/lib/auth";

export const dynamic = "force-dynamic";
// Client router cache, page-scoped. See src/app/games/[id]/page.tsx.
export const unstable_dynamicStaleTime = 300;
export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslation();
  return { title: t("Groups") };
}

export default async function Page() {
  const { t } = await getTranslation();
  const account = await requireAccount();
  if (!account.ok && account.reason === "unconfigured") {
    return (
      <>
        <header className="page-heading">
          <div>
            <p className="eyebrow">{t("Group wagers")}</p>
            <h1 className="display-title">{t("Groups")}</h1>
          </div>
        </header>
        <div className="empty-state">
          <div>
            <span className="empty-icon">
              <UsersRound aria-hidden="true" />
            </span>
            <h3 className="empty-title">{t("Sign-in is not configured")}</h3>
            <p className="empty-copy">
              {t(
                "This environment has no auth provider configured, so there are no groups to show.",
              )}{" "}
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
          <p className="eyebrow">{t("Group wagers")}</p>
          <h1 className="display-title">{t("Groups")}</h1>
          <p className="page-description">
            {t(
              "Place free-to-play wagers with people you know and see who has called it best over time.",
            )}{" "}
          </p>
        </div>
        <Button asChild>
          <Link href="/groups/new">
            <Plus aria-hidden="true" size={18} />
            {t("New group")}
          </Link>
        </Button>
      </header>

      {groups.length === 0 ? (
        <div className="empty-state">
          <div>
            <span className="empty-icon">
              <UsersRound aria-hidden="true" />
            </span>
            <h3 className="empty-title">{t("No groups yet")}</h3>
            <p className="empty-copy">
              {t(
                "Create a group to place wagers together and track the record.",
              )}{" "}
            </p>
            <Button asChild className="mt-5">
              <Link href="/groups/new">
                <Plus aria-hidden="true" size={18} />
                {t("New group")}
              </Link>
            </Button>
          </div>
        </div>
      ) : (
        <GroupList groups={groups} />
      )}
    </>
  );
}
