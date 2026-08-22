"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

/** Revokes one outstanding email invite — the row disappears on refresh. */
export function RevokeInviteButton({
  slug,
  inviteId,
}: {
  slug: string;
  inviteId: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const revoke = async () => {
    setPending(true);
    const response = await fetch(`/api/groups/${slug}/invites/${inviteId}`, {
      method: "DELETE",
    }).catch(() => null);
    setPending(false);
    if (response?.ok) router.refresh();
  };

  return (
    <Button
      type="button"
      size="sm"
      variant="secondary"
      onClick={revoke}
      disabled={pending}
    >
      Revoke
    </Button>
  );
}
