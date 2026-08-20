"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { Button } from "@/components/ui/button";

export function ResetBankroll() {
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleReset = async () => {
    setError(null);
    const response = await fetch("/api/bets/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    }).catch(() => null);

    if (!response?.ok) {
      // A silent failure would leave the unchanged balance on screen looking
      // like a successful reset, so say so instead of refreshing.
      setError(
        response?.status === 429
          ? "Reset limit reached. Try again later."
          : "The reset did not go through. Try again.",
      );
      return;
    }
    setOpen(false);
    router.refresh();
  };

  return (
    <AlertDialog.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <AlertDialog.Trigger asChild>
        <Button variant="secondary" size="sm">
          Reset bankroll
        </Button>
      </AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="alert-overlay" />
        <AlertDialog.Content className="alert-content">
          <AlertDialog.Title className="alert-title">
            Reset your bankroll?
          </AlertDialog.Title>
          <AlertDialog.Description className="alert-description">
            This returns your credit balance to the starting amount. It does not
            affect any wagers already placed.
          </AlertDialog.Description>
          {error ? (
            <p className="alert-description" role="alert">
              {error}
            </p>
          ) : null}
          <div className="alert-actions">
            <AlertDialog.Cancel asChild>
              <Button variant="secondary">Cancel</Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <Button
                variant="danger"
                onClick={(event) => {
                  // Radix closes on Action click; hold it open so a failure
                  // message is actually readable.
                  event.preventDefault();
                  void handleReset();
                }}
              >
                Reset bankroll
              </Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
