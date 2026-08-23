import type { Metadata } from "next";
import { RULES_VERSION } from "@/lib/utils";

export const metadata: Metadata = { title: "Rules" };

export default function Page() {
  return (
    <>
      <header className="page-heading">
        <div>
          <p className="eyebrow">Wager simulator</p>
          <h1 className="display-title">Rules</h1>
          <p className="page-description">
            Credits are fictional, non-withdrawable, and cannot be purchased,
            transferred, or redeemed. This is not a sportsbook.
          </p>
        </div>
      </header>

      <div className="section-grid">
        <section className="panel" aria-labelledby="settlement-heading">
          <div className="panel-header">
            <h2 className="panel-title" id="settlement-heading">
              Settlement
            </h2>
          </div>
          <div className="panel-body">
            <p className="muted">
              Soccer settles on the 90-minute result, including stoppage time.
              MLB settles on the official final, including extra innings.
            </p>
          </div>
        </section>

        <section className="panel" aria-labelledby="push-heading">
          <div className="panel-header">
            <h2 className="panel-title" id="push-heading">
              Push and void handling
            </h2>
          </div>
          <div className="panel-body">
            <p className="muted">
              Every total line ends in .5, so a push can never arise.
              Postponement, abandonment, and cancellation void the wager and
              return the stake. A game with no reported result also voids. A
              soccer match decided in extra time or on penalties voids its
              markets too, because settlement is on the 90-minute result and the
              provider&apos;s full-time score on a knockout tie includes extra
              time.
            </p>
          </div>
        </section>

        <section className="panel" aria-labelledby="pricing-heading">
          <div className="panel-header">
            <h2 className="panel-title" id="pricing-heading">
              Market pricing
            </h2>
          </div>
          <div className="panel-body">
            <p className="muted">
              Prices are fixed and published by this app: a small, hand-picked
              table of decimal odds, identical for every game of a sport, that
              never moves. They are not sourced from any sportsbook and not a
              prediction of the outcome. Credits remain fictional,
              non-withdrawable, and cannot be purchased, transferred, or
              redeemed.
            </p>
          </div>
        </section>

        <section className="panel" aria-labelledby="limitations-heading">
          <div className="panel-header">
            <h2 className="panel-title" id="limitations-heading">
              Limitations
            </h2>
          </div>
          <div className="panel-body">
            <ul className="muted">
              <li>
                Soccer offers four markets: match result (home/draw/away),
                over/under 2.5 goals, both teams to score, and exact score on a
                0-0 through 3-3 grid (16 selections), with no &quot;any other
                score&quot; bucket — a scoreline outside the grid loses every
                exact-score selection.
              </li>
              <li>
                Baseball offers two markets: moneyline (no draw) and over/under
                8.5 runs. Both teams to score and exact score are not offered
                for baseball: both teams scoring is near-certain in MLB, and a
                grid sized for soccer scorelines would miss most MLB finals.
              </li>
              <li>Every total line ends in .5, so a push cannot arise.</li>
              <li>
                A soccer match decided in extra time or on penalties voids its
                markets, because the published rules settle soccer on 90 minutes
                plus stoppage time, but the provider&apos;s full-time score on a
                knockout tie includes extra time.
              </li>
              <li>
                Cancelled or postponed games void. A game with no reported
                result voids.
              </li>
              <li>
                Corners, cards, shots, and assists are not offered — no
                configured feed grades them.
              </li>
            </ul>
          </div>
        </section>
      </div>

      <p className="fine-print mt-5">Rules version {RULES_VERSION}</p>
    </>
  );
}
