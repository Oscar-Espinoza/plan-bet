import { getTranslation } from "@/lib/locale-server";
import Link from "next/link";
import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";

export default async function NotFound() {
  const { t } = await getTranslation();
  return (
    <div className="empty-state" style={{ minHeight: "65vh" }}>
      <div>
        <span className="empty-icon">
          <SearchX aria-hidden="true" />
        </span>
        <p className="eyebrow">{t("404 · Off the schedule")}</p>
        <h1 className="display-title">{t("Matchup not found")}</h1>
        <p className="empty-copy">
          {t(
            "That page does not exist. The games board has every upcoming fixture across soccer and baseball.",
          )}{" "}
        </p>
        <Button asChild className="mt-5">
          <Link href="/">{t("Back to the games board")}</Link>
        </Button>
      </div>
    </div>
  );
}
