"use client";
import { useTranslation } from "@/components/language-provider";

import { NavigationLink as Link } from "@/components/fast-link";
import { RouteError } from "@/components/route-error";

export default function GroupsError({ reset }: { reset: () => void }) {
  const { t } = useTranslation();
  return (
    <RouteError
      title={t("Groups hit an error")}
      copy={
        <>
          {t("Try again, or check your")} <Link href="/you">{t("record")}</Link>{" "}
          {t("while we sort it out.")}{" "}
        </>
      }
      reset={reset}
    />
  );
}
