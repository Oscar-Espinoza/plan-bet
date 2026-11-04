"use client";
import { useTranslation } from "@/components/language-provider";

import { useState } from "react";
import { useRouter } from "next/navigation";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";

/** Loaded on first open (see reset-bankroll.tsx): Radix stays off /you's first load. */
export default function ResetBankrollDialog({
  onClose,
}: {
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const router = useRouter();

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleReset = async () => {
    setError(null);
    setPending(true);
    const response = await fetch("/api/bets/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    }).catch(() => null);
    setPending(false);

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
    onClose();
    router.refresh();
  };

  return (
    <AlertDialog.Root
      open
      onOpenChange={(next) => {
        if (!next && !pending) onClose();
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="alert-overlay" />
        <AlertDialog.Content className="alert-content">
          <AlertDialog.Title className="alert-title">
            {t("Reset your bankroll?")}{" "}
          </AlertDialog.Title>
          <AlertDialog.Description className="alert-description">
            {t(
              "This returns your credit balance to the starting amount. It does not affect any wagers already placed.",
            )}{" "}
          </AlertDialog.Description>
          {error ? (
            <Banner tone="negative" role="alert">
              {t(error)}
            </Banner>
          ) : null}
          <div className="alert-actions">
            <AlertDialog.Cancel asChild>
              <Button variant="secondary" disabled={pending}>
                {t("Cancel")}
              </Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <Button
                variant="danger"
                disabled={pending}
                onClick={(event) => {
                  // Radix closes on Action click; hold it open so a failure
                  // message is actually readable.
                  event.preventDefault();
                  void handleReset();
                }}
              >
                {t(pending ? "Resetting…" : "Reset bankroll")}
              </Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
