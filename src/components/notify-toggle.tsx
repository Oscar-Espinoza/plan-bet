"use client";

import { useState } from "react";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";

export function NotifyToggle({
  slug,
  enabled,
}: {
  slug: string;
  enabled: boolean;
}) {
  const [on, setOn] = useState(enabled);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const toggle = async () => {
    const next = !on;
    setPending(true);
    setError("");
    const response = await fetch(`/api/groups/${slug}/notifications`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notifyOnActivity: next }),
    }).catch(() => null);
    setPending(false);

    if (!response?.ok) {
      setError("That setting did not save. Try again.");
      return;
    }
    setOn(next);
  };

  return (
    <div className="side-form">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={toggle}
        disabled={pending}
        aria-pressed={on}
      >
        Email me group activity: {on ? "on" : "off"}
      </Button>
      <p className="fine-print">
        {on
          ? "You get an email when a member places a wager here and when group wagers settle."
          : "You get no group emails. Activity still shows on this page."}
      </p>
      {error && (
        <Banner tone="negative" role="alert">
          {error}
        </Banner>
      )}
    </div>
  );
}
