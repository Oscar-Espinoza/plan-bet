<script lang="ts">
  import type { Snippet } from "svelte";
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
  const image = $derived(`${data.siteUrl}/opengraph-image`);
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
  <link rel="preconnect" href="https://www.mlbstatic.com" />
</svelte:head>

<LanguageProvider locale={data.locale} messages={data.spanish}>
  <RequestClock zone={data.zone} now={data.requestTime}>
    <AppShell {accountControl}>
      {#if data.maintenance}
        <Banner tone="warning">{data.maintenanceMessage}</Banner>
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
