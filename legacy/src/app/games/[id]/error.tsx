"use client";
import { useTranslation } from "@/components/language-provider";

import { NavigationLink as Link } from "@/components/fast-link";

export default function GameError({ reset }: { reset: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="mp">
      <div className="mp-empty">
        <p className="mp-empty-eyebrow">{t("Games board")}</p>
        <h1 className="mp-empty-title">{t("This game hit an error")}</h1>
        <p className="mp-empty-copy">
          {t("Try again, or check the")}{" "}
          <Link href="/">{t("games board")}</Link>{" "}
          {t("for what else is on.")}{" "}
        </p>
        <button type="button" className="button" onClick={reset}>
          {t("Try again")}{" "}
        </button>
      </div>
    </div>
  );
}
