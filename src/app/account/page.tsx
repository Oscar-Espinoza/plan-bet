import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ResetBankroll } from "@/components/reset-bankroll";
import { Button } from "@/components/ui/button";
import { getCreditSummary } from "@/data/credits";
import { requireAccount, signOut } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Account" };

function hitRateLabel(won: number, lost: number) {
  const decided = won + lost;
  return decided > 0 ? `${Math.round((won / decided) * 100)}%` : "Not provided";
}

export default async function Page() {
  const account = await requireAccount();
  if (!account.ok) redirect("/sign-in?callbackUrl=/account");

  const summary = await getCreditSummary(account.userId);

  return (
    <>
      <header className="page-heading">
        <div>
          <p className="eyebrow">Account</p>
          <h1 className="display-title">
            {account.name ?? account.email ?? "Your account"}
          </h1>
          <p className="page-description">
            A free-to-play credit ledger for the wager simulator. Credits are
            fictional, non-withdrawable, and cannot be purchased.
          </p>
        </div>
      </header>

      <div className="section-grid">
        <section className="panel" aria-labelledby="balance-heading">
          <div className="panel-header">
            <h2 className="panel-title" id="balance-heading">
              Balance
            </h2>
          </div>
          <div className="stat-row">
            <span>Balance</span>
            <strong>{summary.balance.toLocaleString()} credits</strong>
          </div>
          <div className="stat-row">
            <span>Lifetime staked</span>
            <strong>{summary.lifetimeStaked.toLocaleString()} credits</strong>
          </div>
          <div className="stat-row">
            <span>Lifetime returned</span>
            <strong>{summary.lifetimeReturned.toLocaleString()} credits</strong>
          </div>
          <div className="stat-row">
            <span>Net</span>
            <strong>{summary.net.toLocaleString()} credits</strong>
          </div>
          <div className="stat-row">
            <span>Times reset</span>
            <strong>{summary.resetCount.toLocaleString()}</strong>
          </div>
          <div className="form-block">
            <span>Reset your bankroll back to the starting balance.</span>
            <ResetBankroll />
          </div>
        </section>

        <section className="panel" aria-labelledby="record-heading">
          <div className="panel-header">
            <h2 className="panel-title" id="record-heading">
              Record
            </h2>
          </div>
          <div className="stat-row">
            <span>Won</span>
            <strong>{summary.won.toLocaleString()}</strong>
          </div>
          <div className="stat-row">
            <span>Lost</span>
            <strong>{summary.lost.toLocaleString()}</strong>
          </div>
          <div className="stat-row">
            <span>Void</span>
            <strong>{summary.voided.toLocaleString()}</strong>
          </div>
          <div className="stat-row">
            <span>Hit rate</span>
            <strong>{hitRateLabel(summary.won, summary.lost)}</strong>
          </div>
          <div className="form-block">
            <span>
              Times reset: {summary.resetCount.toLocaleString()} — a reset makes
              this record less meaningful.
            </span>
          </div>
          <div className="form-block">
            <span>
              See the <Link href="/bets">full history</Link> or the{" "}
              <Link href="/rules">simulator rules</Link>.
            </span>
          </div>
        </section>

        <section className="panel" aria-labelledby="account-actions-heading">
          <div className="panel-header">
            <h2 className="panel-title" id="account-actions-heading">
              Account
            </h2>
          </div>
          <div className="form-block">
            <span>
              Read the <Link href="/rules">simulator rules</Link> before you
              place a wager.
            </span>
          </div>
          <div className="form-block">
            <span>Sign out of this browser.</span>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/" });
              }}
            >
              <Button type="submit" variant="secondary" size="sm">
                Sign out
              </Button>
            </form>
          </div>
        </section>
      </div>
    </>
  );
}
