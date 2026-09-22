import { getTranslation } from "@/lib/locale-server";
import type { Metadata } from "next";
import { RULES_VERSION } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslation();
  return { title: t("Rules") };
}

export default async function Page() {
  const { t } = await getTranslation();
  return (
    <>
      <header className="page-heading">
        <div>
          <p className="eyebrow">{t("Wager simulator")}</p>
          <h1 className="display-title">{t("Rules")}</h1>
          <p className="page-description">
            {t(
              "Credits are fictional, non-withdrawable, and cannot be purchased, transferred, or redeemed. This is not a sportsbook.",
            )}{" "}
          </p>
        </div>
      </header>

      <div className="section-grid">
        <section className="panel" aria-labelledby="settlement-heading">
          <div className="panel-header">
            <h2 className="panel-title" id="settlement-heading">
              {t("Settlement")}{" "}
            </h2>
          </div>
          <div className="panel-body">
            <p className="muted">
              {t(
                "Soccer settles on the 90-minute result, including stoppage time. MLB settles on the official final, including extra innings.",
              )}{" "}
            </p>
          </div>
        </section>

        <section className="panel" aria-labelledby="push-heading">
          <div className="panel-header">
            <h2 className="panel-title" id="push-heading">
              {t("Push and void handling")}{" "}
            </h2>
          </div>
          <div className="panel-body">
            <p className="muted">
              {t(
                "Every total line ends in .5, so a push can never arise. Postponement, abandonment, and cancellation void the wager and return the stake. A game with no reported result also voids. A soccer match decided in extra time or on penalties voids its markets too, because settlement is on the 90-minute result and the provider's full-time score on a knockout tie includes extra time.",
              )}{" "}
            </p>
          </div>
        </section>

        <section className="panel" aria-labelledby="pricing-heading">
          <div className="panel-header">
            <h2 className="panel-title" id="pricing-heading">
              {t("Market pricing")}{" "}
            </h2>
          </div>
          <div className="panel-body">
            <p className="muted">
              {t(
                "Prices are fixed and published by this app: a small, hand-picked table of decimal odds, identical for every game of a sport, that never moves. They are not sourced from any sportsbook and not a prediction of the outcome. Credits remain fictional, non-withdrawable, and cannot be purchased, transferred, or redeemed.",
              )}{" "}
            </p>
          </div>
        </section>

        <section className="panel" aria-labelledby="limitations-heading">
          <div className="panel-header">
            <h2 className="panel-title" id="limitations-heading">
              {t("Limitations")}{" "}
            </h2>
          </div>
          <div className="panel-body">
            <ul className="muted">
              <li>
                {t(
                  "Football offers match result, double chance, draw no bet, goal totals, both teams to score, team goals, clean sheets, handicaps, and exact scores from 0-0 through 3-3. Scores outside that grid lose every exact-score selection.",
                )}{" "}
              </li>
              <li>
                {t(
                  "Baseball offers moneyline, match run totals, team run thresholds, and run handicaps. All include extra innings.",
                )}{" "}
              </li>
              <li>
                {t(
                  "A 3+ selection wins with at least three. Double chance wins if either named outcome happens. Draw no bet refunds the stake on a draw. Clean sheet means the selected team concedes zero. A handicap adds or subtracts the displayed amount from the selected team’s final score before comparing scores. Decimal multipliers include the original stake.",
                )}
              </li>
              <li>
                {t("Every total line ends in .5, so a push cannot arise.")}
              </li>
              <li>
                {t(
                  "A soccer match decided in extra time or on penalties voids its markets, because the published rules settle soccer on 90 minutes plus stoppage time, but the provider's full-time score on a knockout tie includes extra time.",
                )}{" "}
              </li>
              <li>
                {t(
                  "Cancelled or postponed games void. A game with no reported result voids.",
                )}{" "}
              </li>
              <li>
                {t(
                  "Corners, cards, shots, and assists are not offered — no configured feed grades them.",
                )}{" "}
              </li>
            </ul>
          </div>
        </section>
      </div>

      <p className="fine-print mt-5">
        {t("Rules version")} {RULES_VERSION}
      </p>
    </>
  );
}
