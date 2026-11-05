<script lang="ts">
  import Coins from "@lucide/svelte/icons/coins";
  import { accountChip } from "#lib/state/account-chip.svelte";
  import NavigationLink from "./fast-link/navigation-link.svelte";
  import { DURATION, fade } from "./motion";
  import Button from "./ui/button.svelte";
  import { useTranslation } from "./language.svelte";

  type Props = {
    authConfigured: boolean;
    signedIn: boolean;
    balance?: number;
    won?: number;
    lost?: number;
    openCount?: number;
  };

  let {
    authConfigured,
    signedIn,
    balance = 0,
    won = 0,
    lost = 0,
    openCount = 0,
  }: Props = $props();

  const i18n = useTranslation();
  // A placement writes here before the layout load refreshes. Once the
  // server balance moves, drop the local number and show the ledger again.
  let syncedServer = $state<number | undefined>(undefined);
  $effect(() => {
    const local = accountChip.balance;
    if (!signedIn) {
      if (local !== undefined) accountChip.clear();
      return;
    }
    if (local === undefined) {
      syncedServer = balance;
      return;
    }
    if (balance !== syncedServer) {
      accountChip.clear();
      syncedServer = balance;
    }
  });
  const shownBalance = $derived(
    signedIn ? (accountChip.balance ?? balance) : balance,
  );
  let balanceNode = $state<HTMLSpanElement | null>(null);
  // Plain variable: the first run, hydration, and a server-only change never settle.
  let priorBalance: number | undefined;
  $effect(() => {
    const current = shownBalance;
    const own = accountChip.balance;
    const node = balanceNode;
    const prior = priorBalance;
    priorBalance = current;
    if (prior === undefined || prior === current) return;
    if (own === undefined || !node) return;
    // motion.ts types the defaulted third argument as the swap literal.
    fade(node, 0.6, DURATION.enter as (typeof DURATION)["swap"]);
  });
  const formattedBalance = $derived(i18n.formatNumber(shownBalance));
  const record = $derived(`${won}-${lost}`);
  const openSuffix = $derived(
    openCount > 0 ? ` · ${i18n.t("{p0} open", { p0: openCount })}` : "",
  );
</script>

{#if authConfigured}
  {#if !signedIn}
    <Button href="/sign-in" size="sm" variant="secondary">
      {i18n.t("Sign in")}
    </Button>
  {:else}
    <NavigationLink
      class="account-standing"
      href="/you"
      aria-label={i18n.t(
        "Balance {p0} credits, record {p1} won {p2} lost{p3}",
        {
          p0: formattedBalance,
          p1: won,
          p2: lost,
          p3:
            openCount > 0
              ? i18n.t(", {p0} open wagers", { p0: openCount })
              : "",
        },
      )}
    >
      <Coins aria-hidden="true" size={18} />
      <span bind:this={balanceNode}>{formattedBalance}</span>
      <small class="account-control-detail">
        {record}{i18n.t(openSuffix)}
      </small>
    </NavigationLink>
  {/if}
{/if}
