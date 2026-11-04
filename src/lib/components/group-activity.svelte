<script lang="ts">
  import CalendarDays from "@lucide/svelte/icons/calendar-days";
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import MessageCircle from "@lucide/svelte/icons/message-circle";
  import Receipt from "@lucide/svelte/icons/receipt";
  import Trophy from "@lucide/svelte/icons/trophy";
  import NavigationLink from "#lib/components/fast-link/navigation-link.svelte";
  import { useTranslation } from "#lib/components/language.svelte";
  import LocalDateTime from "#lib/components/local-date-time.svelte";
  import TeamLogo from "#lib/components/team-logo.svelte";
  import StatusTag from "#lib/components/ui/status-tag.svelte";
  import type {
    GroupMatchActivity,
    GroupUpcomingFixture,
  } from "#lib/shared/group-activity";
  import { wagerSelectionLabel } from "#lib/shared/markets";
  import { gameTeamLogo } from "#lib/shared/team-logos";

  type Member = { userId: string; name: string | null };
  type Standing = Member & {
    won: number;
    lost: number;
    voided: number;
    wagerCount: number;
    netReturn: number;
  };

  let {
    matches,
    fixtures,
    entries,
    members,
    viewerId,
  }: {
    matches: GroupMatchActivity[];
    fixtures: GroupUpcomingFixture[];
    entries: Standing[];
    members: Member[];
    viewerId: string;
  } = $props();

  const i18n = useTranslation();
  let expandedMatches = $state<Record<string, boolean>>({});
  let standingsExpanded = $state(false);

  const collapsed = $derived(entries.length > 6 && !standingsExpanded);
  const shown = $derived(
    entries
      .map((entry, index) => ({ entry, rank: index + 1 }))
      .filter(
        ({ entry, rank }) =>
          !collapsed || rank <= 5 || entry.userId === viewerId,
      ),
  );

  function names(ids: string[]) {
    return ids
      .map((id) =>
        id === viewerId
          ? i18n.t("You")
          : (members.find((member) => member.userId === id)?.name ??
            i18n.t("Member")),
      )
      .join(", ");
  }
</script>

<section class="group-standings" aria-labelledby="leaderboard-heading">
  <div class="group-standings-heading">
    <h2 class="group-section-title" id="leaderboard-heading">
      <Trophy size={18} aria-hidden="true" />
      {i18n.t("Leaderboard")}
    </h2>
    <span>{i18n.t("Net credits")}</span>
  </div>
  <ol id="group-standings-list">
    {#each shown as row (row.entry.userId)}
      <li
        class={row.entry.userId === viewerId
          ? "group-standing-current"
          : undefined}
      >
        <span class="group-rank">{row.rank}</span>
        <div class="group-standing-person">
          <strong>
            {row.entry.name ?? i18n.t("Member")}
            {#if row.entry.userId === viewerId}
              <small>{i18n.t("You")}</small>
            {/if}
          </strong>
          <span>
            {i18n.t("Won {p0} · Lost {p1} · Void {p2}", {
              p0: row.entry.won,
              p1: row.entry.lost,
              p2: row.entry.voided,
            })}
          </span>
        </div>
        <strong
          class="group-standing-net"
          data-positive={row.entry.netReturn > 0 ? "true" : undefined}
        >
          {row.entry.netReturn > 0 ? "+" : ""}
          {i18n.formatNumber(row.entry.netReturn)}
        </strong>
      </li>
    {/each}
  </ol>
  {#if entries.length > 6}
    <button
      type="button"
      class="group-expand"
      aria-expanded={standingsExpanded}
      aria-controls="group-standings-list"
      onclick={() => (standingsExpanded = !standingsExpanded)}
    >
      {i18n.t(standingsExpanded ? "Show fewer" : "Show all")}
    </button>
  {/if}
</section>

{#if fixtures.length}
  <section class="group-upcoming" aria-labelledby="group-upcoming-heading">
    <h2 class="group-section-title" id="group-upcoming-heading">
      <CalendarDays size={18} aria-hidden="true" />
      {i18n.t("Upcoming games")}
    </h2>
    <ul>
      {#each fixtures as fixture (fixture.game.id)}
        {@const missing = members
          .map((member) => member.userId)
          .filter((id) => !fixture.bettorIds.includes(id))}
        {@const viewerIn = fixture.bettorIds.includes(viewerId)}
        <li>
          <div class="group-upcoming-game">
            <span class="group-upcoming-teams">
              <TeamLogo src={gameTeamLogo(fixture.game, "home")} />
              <strong>
                {fixture.game.homeTeam}
                <span>{i18n.t("versus")}</span>
                {fixture.game.awayTeam}
              </strong>
              <TeamLogo src={gameTeamLogo(fixture.game, "away")} />
            </span>
            <span class="group-upcoming-meta">
              {i18n.t(fixture.game.competition)} ·
              <LocalDateTime value={fixture.game.scheduledAt} short />
            </span>
          </div>
          <p class="group-upcoming-who">
            {#if fixture.bettorIds.length}
              <span>
                {i18n.t("In:")}
                <b>{names(fixture.bettorIds)}</b>
              </span>
            {:else}
              <span>{i18n.t("Nobody has bet yet")}</span>
            {/if}
            {#if missing.length > 0 && fixture.bettorIds.length > 0}
              <span>
                {i18n.t("Missing:")}
                <b>{names(missing)}</b>
              </span>
            {/if}
            {#if !missing.length}
              <span>{i18n.t("Everyone is in")}</span>
            {/if}
          </p>
          <NavigationLink
            class={viewerIn
              ? "button button-secondary button-sm group-upcoming-cta"
              : "button button-sm group-upcoming-cta"}
            href="/games/{fixture.game.id}"
          >
            {i18n.t(viewerIn ? "View bets" : "Bet")}
            <ChevronRight aria-hidden="true" size={16} />
          </NavigationLink>
        </li>
      {/each}
    </ul>
  </section>
{/if}

<section class="group-feed" aria-labelledby="group-wagers-heading">
  <h2 class="group-section-title" id="group-wagers-heading">
    {i18n.t("Recent activity")}
  </h2>
  {#if matches.length}
    <div class="group-match-list">
      {#each matches as match (match.canonicalGameId)}
        {@const first = match.bets[0]?.wager}
        {@const game = match.game}
        {@const expanded = expandedMatches[match.canonicalGameId] ?? false}
        {@const shownBets = expanded ? match.bets : match.bets.slice(0, 3)}
        {#if first}
          <article class="group-match-card">
            <div class="group-match-meta">
              <span>{i18n.t(game?.competition ?? first.competition)}</span>
              {#if game}
                <StatusTag
                  tone={game.status === "live" ? "positive" : "neutral"}
                >
                  {i18n.t(game.status)}
                </StatusTag>
              {/if}
            </div>
            <NavigationLink
              class="group-match-teams"
              href="/games/{first.routeId}"
            >
              {#if game}
                {#each ["home", "away"] as side (side)}
                  <span class="group-match-team">
                    <TeamLogo
                      src={gameTeamLogo(game, side as "home" | "away")}
                    />
                    <span
                      >{side === "home" ? game.homeTeam : game.awayTeam}</span
                    >
                    {#if game.result}
                      <strong>
                        {side === "home"
                          ? game.result.homeScore
                          : game.result.awayScore}
                      </strong>
                    {/if}
                  </span>
                {/each}
              {:else}
                <strong>{first.matchup}</strong>
              {/if}
            </NavigationLink>
            <div class="group-match-meta">
              <LocalDateTime
                value={game?.scheduledAt ?? first.scheduledAt}
                short
              />
              <span>
                {match.bets.length}
                {i18n.t(match.bets.length === 1 ? "wager" : "wagers")}
              </span>
            </div>
            <div class="group-match-picks" id="picks-{match.canonicalGameId}">
              {#each shownBets as bet (bet.wager.id)}
                {@const name =
                  members.find((member) => member.userId === bet.userId)
                    ?.name ?? i18n.t("Member")}
                {@const selection =
                  game && ["Home", "Away"].includes(bet.wager.selectionLabel)
                    ? bet.wager.selectionId === "home"
                      ? game.homeTeam
                      : game.awayTeam
                    : i18n.t(wagerSelectionLabel(bet.wager))}
                {@const outcome = bet.wager.settlement?.outcome}
                <div class="group-pick">
                  <span class="group-pick-member">
                    {name}
                    {#if bet.userId === viewerId}
                      <small>{i18n.t("You")}</small>
                    {/if}
                  </span>
                  <strong class="group-pick-selection">{selection}</strong>
                  <StatusTag
                    tone={outcome === "won"
                      ? "positive"
                      : outcome === "lost"
                        ? "negative"
                        : "neutral"}
                  >
                    {i18n.t(outcome ?? "open")}
                  </StatusTag>
                </div>
              {/each}
            </div>
            {#if match.bets.length > 3}
              <button
                type="button"
                class="group-expand"
                aria-expanded={expanded}
                aria-controls="picks-{match.canonicalGameId}"
                onclick={() =>
                  (expandedMatches[match.canonicalGameId] = !expanded)}
              >
                {i18n.t(expanded ? "Show fewer bets" : "Show all bets")}
              </button>
            {/if}
            <NavigationLink
              class="group-discussion-link"
              href="/games/{first.routeId}?discussion=1#group-discussion"
            >
              <MessageCircle size={17} aria-hidden="true" />
              {i18n.t("Match & comments")}
              <ChevronRight size={18} aria-hidden="true" />
            </NavigationLink>
          </article>
        {/if}
      {/each}
    </div>
  {:else}
    <div class="empty-state">
      <div>
        <span class="empty-icon">
          <Receipt aria-hidden="true" />
        </span>
        <h3 class="empty-title">{i18n.t("No wagers yet")}</h3>
        <p class="empty-copy">
          {i18n.t("Place a wager with this group from a game page.")}
        </p>
        <NavigationLink href="/" class="button button-secondary button-sm mt-4">
          {i18n.t("Games")}
        </NavigationLink>
      </div>
    </div>
  {/if}
</section>
