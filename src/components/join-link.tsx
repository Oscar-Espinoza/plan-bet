"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";

/**
 * Create-or-reuse a shareable join link for the group and let the owner
 * revoke it. The visible, selectable input is the real deliverable — Copy
 * is a convenience on top of it, guarded because `navigator.clipboard` is
 * undefined on an insecure origin and a thrown TypeError there would be
 * exactly the dead end this feature exists to remove.
 */
export function JoinLink({
  slug,
  initialUrl,
  initialInviteId,
}: {
  slug: string;
  initialUrl?: string;
  initialInviteId?: string;
}) {
  const router = useRouter();
  const [url, setUrl] = useState(initialUrl ?? "");
  const [inviteId, setInviteId] = useState(initialInviteId ?? "");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const createLink = async () => {
    setPending(true);
    setError("");
    setCopied(false);
    const response = await fetch(`/api/groups/${slug}/link`, {
      method: "POST",
    }).catch(() => null);
    setPending(false);

    if (!response?.ok) {
      setError("The join link did not load. Try again.");
      return;
    }
    const payload = (await response.json().catch(() => null)) as {
      data?: { url?: string; inviteId?: string };
    } | null;
    if (!payload?.data?.url || !payload.data.inviteId) {
      setError("The join link did not load. Try again.");
      return;
    }
    setUrl(payload.data.url);
    setInviteId(payload.data.inviteId);
  };

  const copy = async () => {
    try {
      await navigator.clipboard?.writeText(url);
      setCopied(true);
    } catch {
      // The visible input above is still there to select and copy by hand.
    }
  };

  const revoke = async () => {
    setPending(true);
    setError("");
    const response = await fetch(`/api/groups/${slug}/invites/${inviteId}`, {
      method: "DELETE",
    }).catch(() => null);
    setPending(false);

    if (!response?.ok) {
      setError("The link did not revoke. Try again.");
      return;
    }
    setUrl("");
    setInviteId("");
    setCopied(false);
    router.refresh();
  };

  return (
    <div className="side-form">
      <span className="field-label">Join link</span>
      {url ? (
        <>
          <input
            className="field"
            readOnly
            value={url}
            onFocus={(event) => event.target.select()}
            aria-label="Group join link"
          />
          <div className="mt-2 flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={copy}
              disabled={pending}
            >
              {copied ? "Copied" : "Copy"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={revoke}
              disabled={pending}
            >
              Revoke
            </Button>
          </div>
        </>
      ) : (
        <Button type="button" size="sm" onClick={createLink} disabled={pending}>
          Create join link
        </Button>
      )}
      {error && (
        <Banner tone="negative" role="alert">
          {error}
        </Banner>
      )}
    </div>
  );
}
