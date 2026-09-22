import { getTranslation } from "@/lib/locale-server";
import Link from "next/link";
import { Coins } from "lucide-react";
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
  const { formatNumber, t } = await getTranslation();
  if (!isAuthConfigured()) return null;

  const account = await requireAccount();
  if (!account.ok) {
    return (
      <Button asChild size="sm" variant="secondary">
        <Link href="/sign-in">{t("Sign in")}</Link>
      </Button>
    );
  }

  const [summary, openCount] = await Promise.all([
    getCreditSummary(account.userId),
    countOpenWagers(account.userId),
  ]);
  const balance = formatNumber(summary.balance);
  const openSuffix =
    openCount > 0 ? ` · ${t("{p0} open", { p0: openCount })}` : "";
  // Ambient standing (principle 1): balance and record are visible from
  // anywhere, not just on /you. "927 · 14-15" — the W-L half omits voids,
  // matching the chip's already-terse "927 credits · 2 open" shape.
  const record = `${summary.won}-${summary.lost}`;

  return (
    <Link
      className="account-standing"
      href="/you?section=profile#you-settings-heading"
      aria-label={t("Balance {p0} credits, record {p1} won {p2} lost{p3}", {
        p0: balance,
        p1: summary.won,
        p2: summary.lost,
        p3: openCount > 0 ? t(", {p0} open wagers", { p0: openCount }) : "",
      })}
    >
      <Coins aria-hidden="true" size={18} />
      <span>{balance}</span>
      <small className="account-control-detail">
        {record}
        {t(openSuffix)}
      </small>
    </Link>
  );
}
