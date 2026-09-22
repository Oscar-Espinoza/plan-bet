"use client";
import { useTranslation } from "@/components/language-provider";

import { NavigationLink as Link } from "@/components/fast-link";
import { RouteError } from "@/components/route-error";

export default function RootError({ reset }: { reset: () => void }) {
  const { t } = useTranslation();
  return (
    <RouteError
      title={t("This page hit an error")}
      copy={
        <>
          {t("Try again, or head back to the")}{" "}
          <Link href="/">{t("games board")}</Link>.
        </>
      }
      reset={reset}
    />
  );
}
