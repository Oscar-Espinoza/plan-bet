<script lang="ts">
  import type { WagerPanelData } from "#lib/shared/wager-view";
  import { useTranslation } from "../language.svelte";
  import BetSlip from "./bet-slip.svelte";
  import BetSlipSkeleton from "./bet-slip-skeleton.svelte";

  let {
    wagering,
    sport,
    finished,
    home,
    away,
  }: {
    wagering: Promise<WagerPanelData>;
    sport: "soccer" | "baseball";
    finished: boolean;
    home: string;
    away: string;
  } = $props();

  const i18n = useTranslation();
  // Keep the last resolved panel across refreshAll() so the slip does not
  // flash back to the skeleton while the next read is in flight.
  let shown = $state<WagerPanelData | undefined>();
  let failed = $state(false);

  $effect(() => {
    const request = wagering;
    let active = true;
    void request.then(
      (value) => {
        if (!active) return;
        shown = value;
        failed = false;
      },
      () => {
        if (active && !shown) failed = true;
      },
    );
    return () => {
      active = false;
    };
  });
</script>

{#if shown}
  <aside
    class="mp-action"
    aria-label={i18n.t(finished ? "Your match results" : "Place a bet")}
  >
    <BetSlip data={shown} matchup={{ home, away }} />
  </aside>
{:else if failed}
  <aside class="mp-action" aria-label={i18n.t("Place a bet")}>
    <section class="panel wager-panel">
      <p class="side-form">{i18n.t("This game is not open for bets.")}</p>
    </section>
  </aside>
{:else}
  <BetSlipSkeleton {sport} {finished} matchup={{ home, away }} />
{/if}
