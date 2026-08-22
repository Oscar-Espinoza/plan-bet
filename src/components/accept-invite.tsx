"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";

/**
 * The only place this invite is actually accepted — a confirmed POST, not a
 * page load, so a link preview crawler or a refresh cannot join anyone to
 * anything (Phase C).
 */
export function AcceptInvite({
  token,
  groupName,
  invitedByName,
}: {
  token: string;
  groupName: string;
  invitedByName: string | null;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const join = async () => {
    setPending(true);
    setError("");
    const response = await fetch("/api/groups/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    }).catch(() => null);
    setPending(false);

    const payload: unknown = await response?.json().catch(() => null);
    if (!response?.ok) {
      const text =
        payload && typeof payload === "object" && "error" in payload
          ? String(
              (payload as { error: { message?: string } }).error?.message ?? "",
            )
          : "";
      setError(text || "That invite could not be accepted. Try again.");
      return;
    }

    const data = (payload as { data: { groupSlug: string } }).data;
    router.push(`/groups/${data.groupSlug}`);
  };

  return (
    <div className="empty-state">
      <div>
        <h3 className="empty-title">
          {invitedByName ? <strong>{invitedByName}</strong> : "Someone"} invited
          you to <strong>{groupName}</strong>
        </h3>
        <p className="empty-copy">
          Joining puts you on this group&rsquo;s wager board. Credits are
          fictional and non-withdrawable — never real money.
        </p>
        {error && (
          <Banner tone="negative" role="alert">
            {error}
          </Banner>
        )}
        <Button
          type="button"
          className="mt-5"
          onClick={join}
          disabled={pending}
        >
          Join {groupName}
        </Button>
      </div>
    </div>
  );
}
