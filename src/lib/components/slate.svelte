<script lang="ts">
  import { tick } from "svelte";
  import { page } from "$app/state";
  import { SvelteDate } from "svelte/reactivity";
  import CalendarDays from "@lucide/svelte/icons/calendar-days";
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import Radio from "@lucide/svelte/icons/radio";
  import LocalLink from "#lib/components/fast-link/local-link.svelte";
  import MatchLink from "#lib/components/fast-link/match-link.svelte";
  import DemoStamp from "#lib/components/demo-stamp.svelte";
  import KickoffTime from "#lib/components/kickoff-time.svelte";
  import LocalDateTime from "#lib/components/local-date-time.svelte";
  import RelativeKickoff from "#lib/components/relative-kickoff.svelte";
  import { useTranslation } from "#lib/components/language.svelte";
  import type { PreviewMetadata } from "#lib/components/navigation.svelte";
  import StatusTag from "#lib/components/ui/status-tag.svelte";
  import TeamLogo from "#lib/components/team-logo.svelte";
  import TimezoneLegend from "#lib/components/timezone-legend.svelte";
  import { viewerClock } from "#lib/components/clock.svelte";
  import type { BoardData, SportFilter } from "#lib/shared/board";
  import { intlLocale, type Locale } from "#lib/shared/locale";
  import type { GameSummary } from "#lib/server/domain/contracts";
  import { gameTeamLogo } from "#lib/shared/team-logos";
  import { sportPreferenceCookie } from "#lib/shared/sport-preference";
  import { cn } from "#lib/shared/utils";

  let { data, sport: initialSport }: { data: BoardData; sport: SportFilter } =
    $props();

  const i18n = useTranslation();
  const clock = viewerClock();

  const FILTERS: { value: SportFilter; label: string; href: string }[] = [
    { value: "all", label: "All", href: "/" },
    { value: "soccer", label: "Soccer", href: "/?sport=soccer" },
    { value: "baseball", label: "Baseball", href: "/?sport=baseball" },
  ];

  function matchPreview(game: GameSummary, board: BoardData): PreviewMetadata {
    const team = board[game.teamSlug].team;
    return {
      match: {
        identity: {
          sport: game.sport,
          competition: game.competition,
          homeTeam: game.homeTeam,
          awayTeam: game.awayTeam,
          homeTeamLogo: gameTeamLogo(game, "home"),
          awayTeamLogo: gameTeamLogo(game, "away"),
          trackedSide: game.homeTeamSlug === team.slug ? "home" : "away",
          clubColor: team.colors.primary,
        },
        timing: {
          scheduledAt: game.scheduledAt,
          startTimeTbd: game.startTimeTbd,
          scheduledDate: game.scheduledDate,
          status: game.status,
          result: game.result,
          venue: game.venue?.trim() || undefined,
        },
      },
    };
  }

  function isDuplicate(game: GameSummary) {
    return Boolean(
      game.homeTeamSlug &&
      game.awayTeamSlug &&
      game.teamSlug !== game.homeTeamSlug,
    );
  }

  function dayKey(value: string, tz?: string) {
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(
      new Date(value),
    );
  }

  function dayLabel(
    value: string,
    tz: string | undefined,
    todayKey: string,
    tomorrowKey: string,
    locale: Locale,
  ) {
    const key = dayKey(value, tz);
    if (key === todayKey) return "Today";
    if (key === tomorrowKey) return "Tomorrow";
    const label = new Intl.DateTimeFormat(intlLocale(locale), {
      timeZone: tz,
      weekday: "long",
      month: "short",
      day: "numeric",
    }).format(new Date(value));
    return (
      label.charAt(0).toLocaleUpperCase(intlLocale(locale)) + label.slice(1)
    );
  }

  const filterParam = $derived(page.url.searchParams.get("sport"));
  let chosen = $state<SportFilter | null>(null);
  const sport = $derived(
    chosen ??
      (filterParam === "soccer" || filterParam === "baseball"
        ? filterParam
        : filterParam === null
          ? initialSport === "soccer" || initialSport === "baseball"
            ? initialSport
            : "all"
          : "all"),
  );

  let board = $state<HTMLDivElement | null>(null);

  function selectSport(value: SportFilter) {
    document.cookie = sportPreferenceCookie(value);
    if (value === sport) return;
    chosen = value;
    void tick().then(() => {
      if (!board) return;
      const ms = matchMedia("(prefers-reduced-motion: reduce)").matches
        ? 120
        : 150; /* --dur-swap */
      for (const el of board.querySelectorAll(
        ":scope > :is(.live-section, .slate-groups, .panel, .slate-freshness)",
      ))
        el.animate([{ opacity: 0.6 }, { opacity: 1 }], {
          duration: ms,
          easing: "cubic-bezier(0.23, 1, 0.32, 1)",
        });
    });
  }

  const games = $derived(
    Object.values(data)
      .flatMap((schedule) => schedule.games)
      .filter((game) => !isDuplicate(game))
      .filter((game) => sport === "all" || game.sport === sport)
      .sort(
        (a, b) =>
          new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime(),
      ),
  );

  const liveGames = $derived(games.filter((game) => game.status === "live"));
  const scheduledGames = $derived(
    games.filter((game) => game.status !== "live"),
  );

  const dayBuckets = $derived.by(() => {
    const tz = clock.timeZone;
    const now = new SvelteDate(clock.now());
    const todayKey = dayKey(now.toISOString(), tz);
    const tomorrow = new SvelteDate(`${todayKey}T00:00:00Z`);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const tomorrowKey = dayKey(tomorrow.toISOString(), "UTC");
    const locale = i18n.locale;

    const groups: { key: string; label: string; games: GameSummary[] }[] = [];
    for (const game of scheduledGames) {
      const dateOnly = game.startTimeTbd;
      const value = dateOnly
        ? `${game.scheduledDate ?? game.scheduledAt.slice(0, 10)}T00:00:00Z`
        : game.scheduledAt;
      const zone = dateOnly ? "UTC" : tz;
      const key = dayKey(value, zone);
      const group = groups.find((entry) => entry.key === key);
      if (group) {
        group.games.push(game);
      } else {
        groups.push({
          key,
          label: dayLabel(value, zone, todayKey, tomorrowKey, locale),
          games: [game],
        });
      }
    }
    groups.sort((a, b) => a.key.localeCompare(b.key));
    return groups;
  });

  const nextUp = $derived(scheduledGames[0] ?? liveGames[0]);

  const freshness = $derived.by(() => {
    const stamps = [
      sport !== "baseball" && data["real-madrid"].freshness,
      sport !== "soccer" && data["new-york-yankees"].freshness,
    ].filter((stamp) => stamp !== false);
    return stamps.filter(
      (stamp, index) =>
        stamps.findIndex((other) => other.mode === stamp.mode) === index,
    );
  });

  const viewportPrefetchIds = $derived.by(() => {
    const ids: string[] = [];
    for (const game of liveGames) ids.push(game.id);
    for (const group of dayBuckets) {
      for (const game of group.games) ids.push(game.id);
    }
    return new Set(ids.slice(0, 4));
  });

  function visiblePrefetch(gameId: string) {
    return viewportPrefetchIds.has(gameId);
  }
</script>

<div class="board" bind:this={board}>
  {#if nextUp}
    <h1 class="sr-only">{i18n.t("Upcoming games")}</h1>
    <section class="next-up" aria-labelledby="next-match-heading">
      <div class="next-up-header">
        <h2 class="next-up-eyebrow" id="next-match-heading">
          {i18n.t("Next match")}
        </h2>
        {#if !nextUp.startTimeTbd}
          <RelativeKickoff value={nextUp.scheduledAt} />
        {/if}
      </div>
      <h3 class="next-up-teams">
        <span class="next-up-team">
          <TeamLogo priority src={gameTeamLogo(nextUp, "home")} />
          <span>{nextUp.homeTeam}</span>
        </span>
        <span class="next-up-versus">
          <span class="sr-only">{i18n.t("versus")}</span>
          <span aria-hidden="true">VS</span>
        </span>
        <span class="next-up-team next-up-away">
          <TeamLogo priority src={gameTeamLogo(nextUp, "away")} />
          <span>{nextUp.awayTeam}</span>
        </span>
      </h3>
      <div class="next-up-detail">
        <span>{i18n.t(nextUp.competition)}</span>
        <LocalDateTime
          value={nextUp.scheduledAt}
          dateOnly={nextUp.startTimeTbd
            ? (nextUp.scheduledDate ?? nextUp.scheduledAt.slice(0, 10))
            : undefined}
        />
      </div>
      <MatchLink
        eager
        class="button next-up-cta"
        href={`/games/${nextUp.id}`}
        preview={matchPreview(nextUp, data)}
      >
        {i18n.t("View Match & Place Bet")}
        <ChevronRight aria-hidden="true" size={20} />
      </MatchLink>
    </section>
    <div class="slate-freshness slate-freshness-standalone">
      {#each freshness as stamp (stamp.mode)}
        <DemoStamp compact freshness={stamp} />
      {/each}
    </div>
  {:else}
    <header class="slate-hero">
      <div>
        <p class="eyebrow">{i18n.t("Slate")}</p>
        <h1 class="display-title">{i18n.t("Upcoming games")}</h1>
        <p class="page-description">
          {i18n.t(
            "Every tracked fixture across soccer and baseball, nearest kickoff first.",
          )}
        </p>
      </div>
      <div class="slate-freshness">
        {#each freshness as stamp (stamp.mode)}
          <DemoStamp compact freshness={stamp} />
        {/each}
      </div>
    </header>
  {/if}

  <nav class="slate-filters" aria-label={i18n.t("Filter by sport")}>
    {#each FILTERS as filter (filter.value)}
      <LocalLink
        href={filter.href}
        replaceHistory
        class={cn("slate-chip", sport === filter.value && "slate-chip-active")}
        aria-current={sport === filter.value ? "page" : undefined}
        onclick={() => selectSport(filter.value)}
      >
        <span>{i18n.t(filter.label)}</span>
      </LocalLink>
    {/each}
    <TimezoneLegend />
  </nav>

  {#if liveGames.length > 0}
    <section class="live-section" aria-labelledby="live-now-heading">
      <div class="section-heading">
        <h2 id="live-now-heading">
          <Radio aria-hidden="true" />
          {i18n.t("Live Now")}
        </h2>
        <StatusTag>
          {liveGames.length}
          {liveGames.length === 1 ? i18n.t("Game") : i18n.t("Games")}
        </StatusTag>
      </div>
      <div class="game-list live-game-list">
        {#each liveGames as game (game.id)}
          <MatchLink
            class="game-row game-row-live"
            href={`/games/${game.id}`}
            preview={matchPreview(game, data)}
            visiblePrefetch={visiblePrefetch(game.id)}
          >
            <div class="game-time">{i18n.t("LIVE")}</div>
            <div class="game-opponent game-matchup-stacked">
              <span class="game-team">
                <TeamLogo src={gameTeamLogo(game, "home")} />
                <span>{game.homeTeam}</span>
              </span>
              <span class="game-team">
                <TeamLogo src={gameTeamLogo(game, "away")} />
                <span>{game.awayTeam}</span>
              </span>
            </div>
            <ChevronRight class="game-chevron" aria-hidden="true" size={18} />
          </MatchLink>
        {/each}
      </div>
    </section>
  {/if}

  {#if dayBuckets.length}
    <div class="slate-groups">
      {#each dayBuckets as group (group.key)}
        <section class="panel" aria-labelledby={`day-${group.key}`}>
          <div class="panel-header">
            <h2 class="panel-title" id={`day-${group.key}`}>
              <CalendarDays aria-hidden="true" />
              <span>{i18n.t(group.label)}</span>
            </h2>
            <StatusTag>
              {group.games.length}
              {group.games.length === 1 ? i18n.t("game") : i18n.t("games")}
            </StatusTag>
          </div>
          <div class="game-list">
            {#each group.games as game (game.id)}
              <MatchLink
                class={cn(
                  "game-row",
                  game.id === nextUp?.id && "game-row-next",
                )}
                href={`/games/${game.id}`}
                preview={matchPreview(game, data)}
                visiblePrefetch={visiblePrefetch(game.id)}
              >
                <div class="game-time">
                  <KickoffTime
                    value={game.scheduledAt}
                    timeTbd={game.startTimeTbd}
                  />
                </div>
                <div class="game-opponent game-matchup-stacked">
                  <span class="game-team">
                    <TeamLogo src={gameTeamLogo(game, "home")} />
                    <span>{game.homeTeam}</span>
                  </span>
                  <span class="game-team">
                    <TeamLogo src={gameTeamLogo(game, "away")} />
                    <span>{game.awayTeam}</span>
                  </span>
                  {#if game.result}
                    <span class="game-final">
                      {i18n.t("Final")}
                      {game.result.homeScore}&ndash;{game.result.awayScore}
                    </span>
                  {/if}
                </div>
                <ChevronRight
                  class="game-chevron"
                  aria-hidden="true"
                  size={18}
                />
              </MatchLink>
            {/each}
          </div>
        </section>
      {/each}
    </div>
  {:else}
    <div class="panel">
      <div class="mini-empty">
        <p>
          {i18n.t("No upcoming games were provided for this filter.")}
          {#if sport !== "all"}
            <LocalLink
              href="/"
              replaceHistory
              onclick={() => selectSport("all")}
              >{i18n.t("Show all sports")}</LocalLink
            >
          {/if}
        </p>
      </div>
    </div>
  {/if}
</div>
