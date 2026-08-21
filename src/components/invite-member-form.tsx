"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";

export function InviteMemberForm({ slug }: { slug: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError("");
    setMessage("");
    const response = await fetch(`/api/groups/${slug}/invite`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    }).catch(() => null);
    setPending(false);

    if (!response?.ok) {
      const payload: unknown = await response?.json().catch(() => null);
      const text =
        payload && typeof payload === "object" && "error" in payload
          ? String(
              (payload as { error: { message?: string } }).error?.message ?? "",
            )
          : "";
      setError(text || "The invite did not go through. Try again.");
      return;
    }
    const payload = (await response.json().catch(() => null)) as {
      data?: { emailed?: boolean };
    } | null;
    setMessage(
      payload?.data?.emailed
        ? `Invited ${email}. The invite link is on its way.`
        : `Invited ${email}. Email delivery is not configured here, so no message was sent.`,
    );
    setEmail("");
    router.refresh();
  };

  return (
    <form className="side-form" onSubmit={submit}>
      <label htmlFor="invite-email" className="field-label">
        Invite by email
      </label>
      <input
        id="invite-email"
        className="field"
        type="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        required
      />

      {error && (
        <Banner tone="negative" role="alert">
          {error}
        </Banner>
      )}
      {message && <Banner tone="positive">{message}</Banner>}

      <Button type="submit" size="sm" disabled={pending || !email.trim()}>
        Send invite
      </Button>
    </form>
  );
}
