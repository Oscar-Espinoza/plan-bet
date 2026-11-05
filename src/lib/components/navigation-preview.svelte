<script lang="ts">
  import { resolve } from "$app/paths";
  import { page } from "$app/state";
  import { asRoute } from "./href";
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
  const signedIn = $derived(
    Boolean(page.data.account?.authConfigured && page.data.account?.signedIn),
  );
  const isYou = $derived(pathname === "/you");
  const isGroups = $derived(pathname === "/groups");
  const isNewGroup = $derived(pathname === "/groups/new");
  const isGroupDetail = $derived(
    pathname.startsWith("/groups/") &&
      !isNewGroup &&
      !pathname.startsWith("/groups/accept"),
  );
  const isGroup = $derived(isGroupDetail);
  const label = $derived(
    pathname === "/"
      ? "Loading games"
      : isYou
        ? "Loading your record"
        : isGroupDetail
          ? "Loading group"
          : isGroups
            ? "Loading groups"
            : "Loading…",
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
{:else if pathname === "/"}
  <div role="status" aria-label={i18n.t("Loading games")}>
    <div class="board" aria-hidden="true">
      <!-- Measured against the settled hero: 298.625px at 390×844, 285.52px at 1280×800.
           The name line wraps at the phone column and fits on one line at 1280, which is the whole difference. -->
      <section class="next-up">
        <div class="next-up-header">
          <span class="next-up-eyebrow">
            <span class="skeleton-bar" style="width: 7.5rem"></span>
          </span>
          <span class="skeleton-bar" style="width: 4.5rem"></span>
        </div>
        <div class="next-up-teams">
          {#each [0, 1] as side (side)}
            <span class="next-up-team" class:next-up-away={side === 1}>
              <span class="team-logo"></span>
              <span
                style="color: transparent; background: linear-gradient(var(--slat-raised), var(--slat-raised)) center top / 100% 0.72em repeat-y"
                >New York Yankees</span
              >
            </span>
            {#if side === 0}
              <span class="next-up-versus"></span>
            {/if}
          {/each}
        </div>
        <div class="next-up-detail">
          <span style="width: 9rem; background: var(--slat-raised)">&nbsp;</span
          >
          <span style="width: 11rem; background: var(--slat-raised)"
            >&nbsp;</span
          >
        </div>
        <span class="button next-up-cta" style="width: min(100%, 18rem)"></span>
      </section>
      <div class="slate-freshness slate-freshness-standalone">
        <div class="demo-stamp" data-mode="demo">
          <span style="width: 8rem; background: var(--slat-raised)">&nbsp;</span
          >
        </div>
      </div>
      <div class="slate-filters">
        <span class="slate-chip"></span>
        <span class="slate-chip"></span>
        <span class="slate-chip"></span>
        <p class="slate-tz">&nbsp;</p>
      </div>
      <section class="panel">
        <div class="panel-header">
          <span class="skeleton-bar skeleton-bar-header"></span>
        </div>
        <div class="game-list">
          {#each [0, 1, 2] as row (row)}
            <div
              class="loading-panel"
              style="height: 76px; min-height: 76px; background: var(--slat)"
            ></div>
          {/each}
        </div>
      </section>
    </div>
  </div>
{:else}
  <div>
    {#if isYou}
      <header class="page-heading">
        {@render trail([{ label: i18n.t("You") }])}
        <div>
          <p class="eyebrow">{i18n.t("Free-to-play record")}</p>
          <h1 class="display-title">{i18n.t("Where you stand")}</h1>
          {#if signedIn}
            <div
              class="standing-lead standing-lead-loading"
              role="status"
              aria-label={i18n.t("Loading…")}
            ></div>
          {/if}
          <p class="page-description">
            {signedIn
              ? i18n.t("Fictional credits, house prices, never real money.")
              : i18n.t(
                  "Balance, record, open wagers, and history — one surface for where you stand.",
                )}
          </p>
        </div>
      </header>
      {#if signedIn}
        <div
          class="section-tabs"
          style="min-height: 3rem"
          aria-hidden="true"
        ></div>
      {/if}
    {:else if isGroups}
      <header class="page-heading">
        {@render trail([{ label: i18n.t("Groups") }])}
        <div>
          <p class="eyebrow">{i18n.t("Group wagers")}</p>
          <h1 class="display-title">{i18n.t("Groups")}</h1>
          {#if signedIn}
            <p class="page-description">
              {i18n.t(
                "Place free-to-play wagers with people you know and see who has called it best over time.",
              )}
            </p>
          {/if}
        </div>
        {#if signedIn}
          <a
            class="button button-secondary page-heading-action"
            href={resolve(asRoute("/groups/new"))}>{i18n.t("New group")}</a
          >
        {/if}
      </header>
    {:else if isNewGroup}
      <header class="page-heading">
        {@render trail([
          { label: i18n.t("Groups"), href: "/groups" },
          { label: i18n.t("New group") },
        ])}
        <div>
          <p class="eyebrow">{i18n.t("Group wagers")}</p>
          <h1 class="display-title">{i18n.t("New group")}</h1>
        </div>
      </header>
    {:else if isGroupDetail}
      <div class="group-detail">
        <header class="page-heading">
          {@render trail([
            { label: i18n.t("Groups"), href: "/groups" },
            { label: metadata?.groupName ?? i18n.t("Not provided") },
          ])}
          <div>
            <p class="eyebrow">{i18n.t("Group wagers")}</p>
            <h1 class="display-title">
              {metadata?.groupName ?? i18n.t("Not provided")}
            </h1>
            <p class="page-description">&nbsp;</p>
          </div>
        </header>
        <div
          class="group-tabs-bar"
          style="min-height: 3rem"
          aria-hidden="true"
        ></div>
      </div>
    {/if}
    <Skeleton
      {label}
      variant={isYou || isGroup ? "record" : "list"}
      panelCount={isYou ? 4 : 2}
    />
  </div>
{/if}

{#snippet trail(items: { label: string; href?: string }[])}
  <nav class="breadcrumb" aria-hidden="true">
    <ol>
      <li>
        <a href={resolve(asRoute("/"))}>{i18n.t("Games")}</a>
      </li>
      {#each items as item, index (item.label)}
        <li>
          {#if item.href && index < items.length - 1}
            <a href={resolve(asRoute(item.href))}>{item.label}</a>
          {:else}
            <span aria-current="page">{item.label}</span>
          {/if}
        </li>
      {/each}
    </ol>
  </nav>
{/snippet}
