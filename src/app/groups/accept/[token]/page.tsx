import { getTranslation } from "@/lib/locale-server";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { MailX } from "lucide-react";
import { AcceptInvite } from "@/components/accept-invite";
import { Button } from "@/components/ui/button";
import { isGroupMember, previewInvite } from "@/data/groups-repository";
import { requireAccount } from "@/lib/auth";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslation();
  return { title: t("Accept invite") };
}

// A read never mutates the row, so a pending invite past its expiry reads as
// expired here even before acceptGroupInvite flips its status.
function isExpired(expiresAt: string): boolean {
  return new Date(expiresAt).getTime() <= Date.now();
}

async function NotAvailable({ title, copy }: { title: string; copy: string }) {
  const { t } = await getTranslation();
  return (
    <div className="empty-state">
      <div>
        <span className="empty-icon">
          <MailX aria-hidden="true" />
        </span>
        <h3 className="empty-title">{t(title)}</h3>
        <p className="empty-copy">{t(copy)}</p>
        <Button asChild variant="secondary" className="mt-5">
          <Link href="/groups">{t("Your groups")}</Link>
        </Button>
      </div>
    </div>
  );
}

type Props = { params: Promise<{ token: string }> };

/**
 * Read-only preview + a confirmed Join button (Phase C) — this used to
 * accept the invite during render, which meant a link preview crawler or a
 * plain refresh could join someone to a group. Nothing here mutates
 * anything; the only write path is POST /api/groups/accept, called from
 * <AcceptInvite>.
 */
export default async function Page({ params }: Props) {
  const { t } = await getTranslation();
  const { token } = await params;
  const account = await requireAccount();
  if (!account.ok) {
    if (account.reason === "unconfigured") {
      return (
        <NotAvailable
          title={t("Sign-in is not configured")}
          copy={t(
            "This environment has no auth provider configured, so this invite cannot be accepted.",
          )}
        />
      );
    }
    redirect(`/sign-in?callbackUrl=/groups/accept/${token}`);
  }

  const preview = await previewInvite(token);
  if (!preview) {
    return (
      <NotAvailable
        title={t("Invite not accepted")}
        copy={t("This invite link is no longer valid.")}
      />
    );
  }

  // An already-member visitor (including the invite's own sender revisiting
  // it) is not an error — acceptGroupInvite's onConflictDoNothing already
  // makes re-accepting a no-op, so the preview says so and links onward.
  if (await isGroupMember(preview.groupId, account.userId)) {
    return (
      <div className="empty-state">
        <div>
          <span className="empty-icon">
            <MailX aria-hidden="true" />
          </span>
          <h3 className="empty-title">{t("Already joined")}</h3>
          <p className="empty-copy">
            {t("You’re already in")} {preview.groupName}.
          </p>
          <Button asChild variant="secondary" className="mt-5">
            <Link href={`/groups/${preview.groupSlug}`}>
              {t("Go to")} {preview.groupName}
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  if (preview.status === "revoked") {
    return (
      <NotAvailable
        title={t("Invite not accepted")}
        copy={t("This invite was revoked. Ask the group for a new one.")}
      />
    );
  }
  if (preview.status === "accepted") {
    return (
      <NotAvailable
        title={t("Invite not accepted")}
        copy={t("This invite link is no longer valid.")}
      />
    );
  }
  if (preview.status === "expired" || isExpired(preview.expiresAt)) {
    return (
      <NotAvailable
        title={t("Invite not accepted")}
        copy={t("This invite has expired. Ask the group for a new one.")}
      />
    );
  }

  return (
    <AcceptInvite
      token={token}
      groupName={preview.groupName}
      invitedByName={preview.invitedByName}
    />
  );
}
