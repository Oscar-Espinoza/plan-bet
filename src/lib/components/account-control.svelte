<script lang="ts">
  import Coins from "@lucide/svelte/icons/coins";
  import NavigationLink from "./fast-link/navigation-link.svelte";
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
  const formattedBalance = $derived(i18n.formatNumber(balance));
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
      <span>{formattedBalance}</span>
      <small class="account-control-detail">
        {record}{i18n.t(openSuffix)}
      </small>
    </NavigationLink>
  {/if}
{/if}
