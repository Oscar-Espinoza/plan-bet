"use client";
import { lazy, Suspense, useState } from "react";
import { useTranslation } from "@/components/language-provider";
import { Button } from "@/components/ui/button";

const ResetBankrollDialog = lazy(() => import("./reset-bankroll-dialog"));

/**
 * The trigger only. The confirmation (and Radix with it) is fetched on first
 * click; Radix returns focus here when it closes, as it did with a Trigger.
 */
export function ResetBankroll() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="danger"
        size="sm"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        {t("Reset bankroll")}
      </Button>
      {open && (
        <Suspense fallback={null}>
          <ResetBankrollDialog onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </>
  );
}
