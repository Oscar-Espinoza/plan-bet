<script lang="ts">
  import { onMount, type Snippet } from "svelte";
  import { onNavigate } from "$app/navigation";
  import { fullCssReady } from "#lib/components/full-css";
  import "../app.css";
  import "#lib/styles/matchup.css";
  import AppShell from "#lib/components/app-shell.svelte";
  import AccountControl from "#lib/components/account-control-lazy.svelte";
  import LanguageProvider from "#lib/components/language-provider.svelte";
  import RefreshVisiblePage from "#lib/components/refresh-visible-page.svelte";
  import RequestClock from "#lib/components/request-clock.svelte";
  import Banner from "#lib/components/ui/banner.svelte";
  import type { LayoutData } from "./$types";

  let { data, children }: { data: LayoutData; children: Snippet } = $props();
  const image = $derived(`${data.siteUrl}/og.png`);

  onNavigate(async (navigation) => {
    if (typeof document === "undefined") return;
    const w = window as Window & { __mpUaVT?: boolean };
    const uaAnimated = navigation.type === "popstate" && w.__mpUaVT === true;
    w.__mpUaVT = false;
    // Critical CSS is this document's rules. Wait for the full sheet so the
    // next page does not paint before those rules exist.
    await fullCssReady();
    if (!document.startViewTransition) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // An iOS edge swipe or Android predictive back has already animated.
    if (uaAnimated) return;
    // Query-only updates (current tab, history paging, ?pick, ?section)
    // replace in place. A whole-page crossfade would freeze input.
    if (navigation.from?.url.pathname === navigation.to?.url.pathname) return;

    return new Promise<void>((resolve) => {
      document.startViewTransition(async () => {
        resolve();
        await navigation.complete;
      });
    });
  });

  onMount(() => {
    void import("#lib/components/interaction-hooks").then((m) => m.install());
  });
</script>

<svelte:head>
  <title>{data.title}</title>
  <meta name="description" content={data.description} />
  <meta name="application-name" content="Matchday Plan" />
  <meta name="author" content="Matchday Plan" />
  <meta
    name="keywords"
    content="sports, matchday, soccer, baseball, portfolio"
  />
  <link rel="canonical" href="{data.siteUrl}/" />
  <meta name="robots" content="index, follow" />
  <meta name="googlebot" content="index, follow" />
  <meta property="og:title" content="Matchday Plan" />
  <meta property="og:description" content={data.ogDescription} />
  <meta property="og:site_name" content="Matchday Plan" />
  <meta property="og:type" content="website" />
  <meta property="og:image" content={image} />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta
    property="og:image:alt"
    content="Matchday Plan sports preparation workspace"
  />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="Matchday Plan" />
  <meta name="twitter:description" content={data.twitterDescription} />
  <meta name="twitter:image" content={image} />
  <meta
    name="twitter:image:alt"
    content="Matchday Plan sports preparation workspace"
  />
  <link rel="icon" href="/icon.png" type="image/png" sizes="64x64" />
  <link rel="preconnect" href="https://www.mlbstatic.com" />
</svelte:head>

<LanguageProvider locale={data.locale} messages={data.spanish}>
  <RequestClock zone={data.zone} now={data.requestTime}>
    <AppShell {accountControl}>
      {#if data.maintenance}
        <Banner class="banner-static" tone="warning"
          >{data.maintenanceMessage}</Banner
        >
      {/if}
      <RefreshVisiblePage />
      {@render children()}
    </AppShell>
  </RequestClock>
</LanguageProvider>

{#snippet accountControl()}
  <AccountControl
    authConfigured={data.account.authConfigured}
    signedIn={data.account.signedIn}
    balance={data.account.signedIn ? data.account.balance : 0}
    won={data.account.signedIn ? data.account.won : 0}
    lost={data.account.signedIn ? data.account.lost : 0}
    openCount={data.account.signedIn ? data.account.openCount : 0}
  />
{/snippet}
