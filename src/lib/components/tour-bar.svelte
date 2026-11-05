<script lang="ts">
  import { page } from "$app/state";
  import { matchday } from "#lib/state/store.svelte";
  import { bandHeight } from "./band-height";
  import { useTranslation } from "./language.svelte";
  import Button from "./ui/button.svelte";

  const STEPS = [
    "Start here — pick any game from the board.",
    "Tap a price to back a side, set a stake, place it.",
    "That's it. See where you stand on You.",
  ];

  const i18n = useTranslation();
  const pathname = $derived(page.url.pathname);
  const step = $derived(STEPS[matchday.tourStep]);
  let leaving = $state(false);

  function skipTour() {
    if (leaving) return;
    leaving = true;
    setTimeout(() => {
      matchday.finishTour();
      leaving = false;
    }, 200 /* --dur-enter */);
  }

  $effect(() => {
    if (!matchday.hydrated) return;
    if (pathname.startsWith("/games/")) matchday.advanceTour(1);
    else if (pathname === "/you") matchday.finishTour();
  });
</script>

{#if matchday.hydrated && matchday.tourStep < STEPS.length && step}
  <div
    class="tour-bar"
    class:tour-bar-leaving={leaving}
    use:bandHeight={"--tour-h"}
    role="region"
    aria-label={i18n.t("Getting started tour")}
  >
    <p class="tour-bar-copy">
      <span class="tour-bar-count"
        >{matchday.tourStep + 1} {i18n.t("of")} {STEPS.length}</span
      >
      {i18n.t(step)}
    </p>
    <Button
      variant="secondary"
      size="sm"
      onclick={skipTour}
      aria-label={i18n.t("Skip the tour")}
    >
      {i18n.t("Skip")}
    </Button>
  </div>
{/if}
