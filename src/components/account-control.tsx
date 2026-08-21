import Link from "next/link";
import { getCreditSummary } from "@/data/credits";
import { countOpenWagers } from "@/data/wagers-repository";
import { isAuthConfigured, requireAccount } from "@/lib/auth";
import { Button } from "@/components/ui/button";

/**
 * Renders nothing when sign-in isn't configured — without ever calling
 * `requireAccount()` / `auth()`. That is what keeps a keyless build's
 * statically-rendered routes (/, /rules) static.
 */
export async function AccountControl() {
  if (!isAuthConfigured()) return null;

  const account = await requireAccount();
  if (!account.ok) {
    return (
      <Button asChild size="sm" variant="secondary">
        <Link href="/sign-in">Sign in</Link>
      </Button>
    );
  }

  const [summary, openCount] = await Promise.all([
    getCreditSummary(account.userId),
    countOpenWagers(account.userId),
  ]);
  const balance = summary.balance.toLocaleString();
  const openSuffix = openCount > 0 ? ` · ${openCount} open` : "";
  // Ambient standing (principle 1): balance and record are visible from
  // anywhere, not just on /you. "927 · 14-15" — the W-L half omits voids,
  // matching the chip's already-terse "927 credits · 2 open" shape.
  const record = `${summary.won}-${summary.lost}`;

  return (
    <Link
      className="button button-secondary button-sm"
      href="/you"
      aria-label={`Balance ${balance} credits, record ${summary.won} won ${summary.lost} lost${openCount > 0 ? `, ${openCount} open wagers` : ""}`}
    >
      {balance} · {record}
      {openSuffix}
    </Link>
  );
}
