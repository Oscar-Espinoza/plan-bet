<script lang="ts">
  import type { MatchView } from "#lib/shared/game-view";
  import Countdown from "../countdown.svelte";
  import LocalDateTime from "../local-date-time.svelte";
  import TeamLogo from "../team-logo.svelte";
  import { useTranslation } from "../language.svelte";

  let { identity, timing }: Pick<MatchView, "identity" | "timing"> = $props();
  const i18n = useTranslation();

  const statusLabel = $derived(
    timing.status === "finished"
      ? "Full time"
      : timing.status === "live"
        ? "Live"
        : timing.status === "postponed"
          ? "Postponed"
          : timing.status === "cancelled"
            ? "Cancelled"
            : "Upcoming",
  );
</script>

<header class="mp-bug">
  <span class="mp-bug-scrim" aria-hidden="true"></span>
  <span class="mp-status-pill">{i18n.t(statusLabel)}</span>
  <p class="mp-comp">
    <span>{i18n.t(identity.competition)}</span>
    {#if identity.stage}
      <span class="mp-comp-stage">{i18n.t(identity.stage)}</span>
    {/if}
  </p>
  <div class="mp-sides" data-played={timing.result ? "" : undefined}>
    {#each [["home", identity.homeTeam], ["away", identity.awayTeam]] as [which, name] (which)}
      {#if which === "away"}
        <span class="mp-scoreline" aria-hidden="true">
          {#if timing.result}
            <strong class="mp-side-score">{timing.result.homeScore}</strong>
            <span>–</span>
            <strong class="mp-side-score">{timing.result.awayScore}</strong>
          {:else}
            <span>VS</span>
          {/if}
        </span>
      {/if}
      <div
        class="mp-side"
        data-tracked={which === identity.trackedSide ? "" : undefined}
        style={which === identity.trackedSide
          ? `--mp-club: ${identity.clubColor}`
          : undefined}
      >
        <span class="mp-side-label"
          >{which === "home" ? i18n.t("Home") : i18n.t("Away")}</span
        >
        <span class="mp-side-team">
          <TeamLogo
            priority
            src={which === "home"
              ? identity.homeTeamLogo
              : identity.awayTeamLogo}
          />
          <span class="mp-side-name">{name}</span>
        </span>
      </div>
    {/each}
  </div>
  {#if timing.result?.completion === "extra"}
    <p class="mp-aftermath">{i18n.t("After extra time")}</p>
  {/if}
  {#if timing.result?.completion === "shootout"}
    <p class="mp-aftermath">{i18n.t("After penalties")}</p>
  {/if}
  {#if !timing.result && !timing.startTimeTbd}
    <div class="mp-clock">
      <span class="mp-clock-label">{i18n.t("Kickoff in")}</span>
      <strong class="mp-clock-figure">
        <Countdown value={timing.scheduledAt} />
      </strong>
    </div>
  {/if}
  <div class="mp-when">
    <LocalDateTime
      value={timing.scheduledAt}
      dateOnly={timing.startTimeTbd
        ? (timing.scheduledDate ?? timing.scheduledAt.slice(0, 10))
        : undefined}
    />
    {#if timing.venue}
      <span class="mp-venue">{timing.venue}</span>
    {/if}
  </div>
</header>
