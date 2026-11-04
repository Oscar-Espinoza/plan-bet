"use client";
import { useTranslation } from "@/components/language-provider";

import { NavigationLink as Link } from "@/components/fast-link";
import { RouteError } from "@/components/route-error";

export default function YouError({ reset }: { reset: () => void }) {
  const { t } = useTranslation();
  return (
    <RouteError
      title={t("Your record hit an error")}
      copy={
        <>
          {t("Try again, or place your next wager from the")}{" "}
          <Link href="/">{t("games board")}</Link>{" "}
          {t("while we sort it out.")}{" "}
        </>
      }
      reset={reset}
    />
  );
}
