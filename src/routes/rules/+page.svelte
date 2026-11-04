<script lang="ts">
  import Breadcrumb from "#lib/components/breadcrumb.svelte";
  import { useTranslation } from "#lib/components/language.svelte";
  import { RULES_VERSION } from "#lib/shared/utils";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();
  const i18n = useTranslation();
</script>

<svelte:head>
  <title>{data.title}</title>
</svelte:head>

<header class="page-heading">
  <Breadcrumb items={[{ label: i18n.t("Rules") }]} />
  <div>
    <p class="eyebrow">{i18n.t("Wager simulator")}</p>
    <h1 class="display-title">{i18n.t("Rules")}</h1>
    <p class="page-description">
      {i18n.t(
        "Credits are fictional, non-withdrawable, and cannot be purchased, transferred, or redeemed. This is not a sportsbook.",
      )}
    </p>
  </div>
</header>

<div class="section-grid">
  <section class="panel" aria-labelledby="settlement-heading">
    <div class="panel-header">
      <h2 class="panel-title" id="settlement-heading">
        {i18n.t("Settlement")}
      </h2>
    </div>
    <div class="panel-body">
      <p class="muted">
        {i18n.t(
          "Soccer settles on the 90-minute result, including stoppage time. MLB settles on the official final, including extra innings.",
        )}
      </p>
    </div>
  </section>

  <section class="panel" aria-labelledby="push-heading">
    <div class="panel-header">
      <h2 class="panel-title" id="push-heading">
        {i18n.t("Push and void handling")}
      </h2>
    </div>
    <div class="panel-body">
      <p class="muted">
        {i18n.t(
          "Every total line ends in .5, so a push can never arise. Postponement, abandonment, and cancellation void the wager and return the stake. A game with no reported result also voids. A soccer match decided in extra time or on penalties voids its markets too, because settlement is on the 90-minute result and the provider's full-time score on a knockout tie includes extra time.",
        )}
      </p>
    </div>
  </section>

  <section class="panel" aria-labelledby="pricing-heading">
    <div class="panel-header">
      <h2 class="panel-title" id="pricing-heading">
        {i18n.t("Market pricing")}
      </h2>
    </div>
    <div class="panel-body">
      <p class="muted">
        {i18n.t(
          "Prices are fixed and published by this app: a small, hand-picked table of decimal odds, identical for every game of a sport, that never moves. They are not sourced from any sportsbook and not a prediction of the outcome. Credits remain fictional, non-withdrawable, and cannot be purchased, transferred, or redeemed.",
        )}
      </p>
    </div>
  </section>

  <section class="panel" aria-labelledby="limitations-heading">
    <div class="panel-header">
      <h2 class="panel-title" id="limitations-heading">
        {i18n.t("Limitations")}
      </h2>
    </div>
    <div class="panel-body">
      <ul class="muted rules-list">
        <li>
          {i18n.t(
            "Football offers match result, double chance, draw no bet, goal totals, both teams to score, team goals, clean sheets, handicaps, and exact scores from 0-0 through 3-3. Scores outside that grid lose every exact-score selection.",
          )}
        </li>
        <li>
          {i18n.t(
            "Baseball offers moneyline, match run totals, team run thresholds, and run handicaps. All include extra innings.",
          )}
        </li>
        <li>
          {i18n.t(
            "A 3+ selection wins with at least three. Double chance wins if either named outcome happens. Draw no bet refunds the stake on a draw. Clean sheet means the selected team concedes zero. A handicap adds or subtracts the displayed amount from the selected team’s final score before comparing scores. Decimal multipliers include the original stake.",
          )}
        </li>
        <li>
          {i18n.t("Every total line ends in .5, so a push cannot arise.")}
        </li>
        <li>
          {i18n.t(
            "A soccer match decided in extra time or on penalties voids its markets, because the published rules settle soccer on 90 minutes plus stoppage time, but the provider's full-time score on a knockout tie includes extra time.",
          )}
        </li>
        <li>
          {i18n.t(
            "Cancelled or postponed games void. A game with no reported result voids.",
          )}
        </li>
        <li>
          {i18n.t(
            "Corners, cards, shots, and assists are not offered — no configured feed grades them.",
          )}
        </li>
      </ul>
    </div>
  </section>
</div>

<p class="fine-print mt-5">
  {i18n.t("Rules version")}
  {RULES_VERSION}
</p>
