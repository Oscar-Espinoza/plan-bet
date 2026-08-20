import type { Metadata } from "next";
import { RULES_VERSION } from "@/lib/rules";

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
              An exact-line push returns the stake. Postponement, abandonment,
              and cancellation void the wager and return the stake.
            </p>
          </div>
        </section>
      </div>

      <p className="fine-print mt-5">Rules version {RULES_VERSION}</p>
    </>
  );
}
