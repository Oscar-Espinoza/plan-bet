import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { MailX } from "lucide-react";
import { acceptGroupInvite } from "@/data/groups";
import { Button } from "@/components/ui/button";
import { requireAccount } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Accept invite" };

const REASON_COPY: Record<
  Exclude<
    Awaited<ReturnType<typeof acceptGroupInvite>>,
    { ok: true; groupSlug: string }
  >["reason"],
  string
> = {
  not_found: "This invite link is no longer valid.",
  expired: "This invite has expired. Ask the group for a new one.",
  email_mismatch:
    "This invite was sent to a different email address than the one you're signed in with.",
};

type Props = { params: Promise<{ token: string }> };

export default async function Page({ params }: Props) {
  const { token } = await params;
  const account = await requireAccount();
  if (!account.ok) {
    if (account.reason === "unconfigured") {
      return (
        <div className="empty-state">
          <div>
            <span className="empty-icon">
              <MailX aria-hidden="true" />
            </span>
            <h3 className="empty-title">Sign-in is not configured</h3>
            <p className="empty-copy">
              This environment has no auth provider configured, so this invite
              cannot be accepted.
            </p>
          </div>
        </div>
      );
    }
    redirect(`/sign-in?callbackUrl=/groups/accept/${token}`);
  }
  if (!account.email) {
    return (
      <div className="empty-state">
        <div>
          <span className="empty-icon">
            <MailX aria-hidden="true" />
          </span>
          <h3 className="empty-title">No email on this account</h3>
          <p className="empty-copy">
            This invite is matched by email, and your signed-in account has none
            on file.
          </p>
        </div>
      </div>
    );
  }

  const outcome = await acceptGroupInvite({
    token,
    userId: account.userId,
    userEmail: account.email,
  });

  if (outcome.ok) redirect(`/groups/${outcome.groupSlug}`);

  return (
    <div className="empty-state">
      <div>
        <span className="empty-icon">
          <MailX aria-hidden="true" />
        </span>
        <h3 className="empty-title">Invite not accepted</h3>
        <p className="empty-copy">{REASON_COPY[outcome.reason]}</p>
        <Button asChild variant="secondary" className="mt-5">
          <Link href="/groups">Your groups</Link>
        </Button>
      </div>
    </div>
  );
}
