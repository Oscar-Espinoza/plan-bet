import Link from "next/link";
import { getCreditSummary } from "@/data/credits";
import { isAuthConfigured, requireAccount } from "@/lib/auth";
import { Button } from "@/components/ui/button";

/**
 * Renders nothing when sign-in isn't configured — without ever calling
 * `requireAccount()` / `auth()`. That is what keeps a keyless build's
 * statically-rendered routes (/watchlist, /activity, /rules) static.
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

  const summary = await getCreditSummary(account.userId);
  const balance = summary.balance.toLocaleString();

  return (
    <Link
      className="button button-secondary button-sm"
      href="/account"
      aria-label={`Account, balance ${balance} credits`}
    >
      {balance} credits
    </Link>
  );
}
