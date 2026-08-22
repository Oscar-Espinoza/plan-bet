import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { MailX } from "lucide-react";
import { AcceptInvite } from "@/components/accept-invite";
import { Button } from "@/components/ui/button";
import { isGroupMember, previewInvite } from "@/data/groups-repository";
import { requireAccount } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Accept invite" };

// A read never mutates the row, so a pending invite past its expiry reads as
// expired here even before acceptGroupInvite flips its status.
function isExpired(expiresAt: string): boolean {
  return new Date(expiresAt).getTime() <= Date.now();
}

function NotAvailable({ title, copy }: { title: string; copy: string }) {
  return (
    <div className="empty-state">
      <div>
        <span className="empty-icon">
          <MailX aria-hidden="true" />
        </span>
        <h3 className="empty-title">{title}</h3>
        <p className="empty-copy">{copy}</p>
        <Button asChild variant="secondary" className="mt-5">
          <Link href="/groups">Your groups</Link>
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
  const { token } = await params;
  const account = await requireAccount();
  if (!account.ok) {
    if (account.reason === "unconfigured") {
      return (
        <NotAvailable
          title="Sign-in is not configured"
          copy="This environment has no auth provider configured, so this invite cannot be accepted."
        />
      );
    }
    redirect(`/sign-in?callbackUrl=/groups/accept/${token}`);
  }

  const preview = await previewInvite(token);
  if (!preview) {
    return (
      <NotAvailable
        title="Invite not accepted"
        copy="This invite link is no longer valid."
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
          <h3 className="empty-title">Already joined</h3>
          <p className="empty-copy">
            You&rsquo;re already in {preview.groupName}.
          </p>
          <Button asChild variant="secondary" className="mt-5">
            <Link href={`/groups/${preview.groupSlug}`}>
              Go to {preview.groupName}
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  if (preview.status === "revoked") {
    return (
      <NotAvailable
        title="Invite not accepted"
        copy="This invite was revoked. Ask the group for a new one."
      />
    );
  }
  if (preview.status === "accepted") {
    return (
      <NotAvailable
        title="Invite not accepted"
        copy="This invite link is no longer valid."
      />
    );
  }
  if (preview.status === "expired" || isExpired(preview.expiresAt)) {
    return (
      <NotAvailable
        title="Invite not accepted"
        copy="This invite has expired. Ask the group for a new one."
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
