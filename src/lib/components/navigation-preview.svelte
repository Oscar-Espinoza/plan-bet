<script lang="ts">
  import { useTranslation } from "./language.svelte";
  import { type PreviewMetadata } from "./navigation.svelte";
  import Skeleton from "./ui/skeleton.svelte";
  import MatchChrome from "./matchup/match-chrome.svelte";
  import BetSlipSkeleton from "./matchup/bet-slip-skeleton.svelte";
  import StatusRibbon from "./matchup/status-ribbon.svelte";

  let { href, metadata }: { href: string; metadata?: PreviewMetadata } =
    $props();
  const i18n = useTranslation();
  const pathname = $derived(href.split(/[?#]/)[0] ?? href);
  const isYou = $derived(pathname === "/you");
  const isGroup = $derived(pathname.startsWith("/groups/"));
  const label = $derived(
    pathname === "/"
      ? "Loading games"
      : isYou
        ? "Loading your record"
        : isGroup
          ? "Loading group"
          : pathname === "/groups"
            ? "Loading groups"
            : "Loading…",
  );
  const heading = $derived(
    isYou
      ? "Where you stand"
      : pathname === "/groups"
        ? "Groups"
        : pathname === "/"
          ? "Games"
          : undefined,
  );
</script>

{#if pathname.startsWith("/games/")}
  <div class="mp" role="status" aria-label={i18n.t("Loading game")}>
    <MatchChrome view={metadata?.match} />
    <div class="mp-tab-panel">
      <div class="mp-overview">
        {#if metadata?.match}
          <StatusRibbon status={metadata.match.timing.status} />
        {/if}
        <BetSlipSkeleton
          sport={metadata?.match?.identity.sport}
          finished={metadata?.match?.timing.status === "finished"}
          matchup={metadata?.match
            ? {
                home: metadata.match.identity.homeTeam,
                away: metadata.match.identity.awayTeam,
              }
            : undefined}
        />
        <div class="mp-blocks" aria-hidden="true">
          {#each [0, 1] as key (key)}
            <section class="mp-block match-context-skeleton">
              <span class="match-placeholder"
                ><span>{i18n.t("Match information")}</span></span
              >
              {#each [0, 1, 2] as row (row)}
                <div class="match-context-row">
                  <span class="match-placeholder"
                    ><span>{i18n.t("Loading…")}</span></span
                  >
                  <span class="match-placeholder"><span>00 – 00</span></span>
                </div>
              {/each}
            </section>
          {/each}
        </div>
      </div>
    </div>
  </div>
{:else}
  <div>
    {#if heading || metadata?.groupName}
      <h1 class="display-title">
        {metadata?.groupName ?? i18n.t(heading ?? "")}
      </h1>
    {/if}
    <Skeleton
      {label}
      variant={isYou || isGroup ? "record" : "list"}
      panelCount={isYou ? 4 : 2}
    />
  </div>
{/if}
