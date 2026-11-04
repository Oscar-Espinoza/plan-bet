<script lang="ts">
  import NavigationLink from "../fast-link/navigation-link.svelte";
  import { useTranslation } from "../language.svelte";

  let { routeId, finished }: { routeId: string; finished: boolean } = $props();

  const i18n = useTranslation();
</script>

<aside
  class="mp-action"
  aria-label={i18n.t(finished ? "Your match results" : "Place a bet")}
>
  <section class="panel wager-panel">
    <div class="panel-header">
      <div>
        <h2 class="panel-title">
          <span>{i18n.t(finished ? "Match finished" : "Make a bet")}</span>
        </h2>
        <p class="panel-purpose">
          {i18n.t("Simulate a bet on this match with fictional credits.")}
        </p>
      </div>
    </div>
    <div class="side-form">
      <NavigationLink
        class="button w-full"
        href={`/sign-in?callbackUrl=/games/${routeId}`}
      >
        {i18n.t("Sign in")}
      </NavigationLink>
      <p class="fine-print">
        {i18n.t(
          "Signing in only unlocks the credit ledger — the rest of the page works signed out.",
        )}
      </p>
    </div>
  </section>
</aside>
