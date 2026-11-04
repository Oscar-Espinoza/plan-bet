import { getTranslation } from "@/lib/locale-server";
import { NavigationLink as Link } from "@/components/fast-link";

export default async function GameNotFound() {
  const { t } = await getTranslation();
  return (
    <div className="mp">
      <div className="mp-empty">
        <p className="mp-empty-eyebrow">{t("Games board")}</p>
        <h1 className="mp-empty-title">{t("Game not found")}</h1>
        <p className="mp-empty-copy">
          {t(
            "This matchup is not on the current slate. Every upcoming fixture is on the games board.",
          )}{" "}
        </p>
        <Link className="button" href="/">
          {t("Back to the games board")}{" "}
        </Link>
      </div>
    </div>
  );
}
