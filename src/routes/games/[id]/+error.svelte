<script lang="ts">
  import { page } from "$app/state";
  import { refreshAll } from "$app/navigation";
  import { useTranslation } from "#lib/components/language.svelte";
  import NavigationLink from "#lib/components/fast-link/navigation-link.svelte";

  const i18n = useTranslation();
</script>

<svelte:head>
  {#if page.status === 404}
    <title>Matchup not found · Matchday Plan</title>
  {/if}
</svelte:head>

{#if page.status === 404}
  <div class="mp">
    <div class="mp-empty">
      <p class="mp-empty-eyebrow">{i18n.t("Games board")}</p>
      <h1 class="mp-empty-title">{i18n.t("Game not found")}</h1>
      <p class="mp-empty-copy">
        {i18n.t(
          "This matchup is not on the current slate. Every upcoming fixture is on the games board.",
        )}
      </p>
      <NavigationLink class="button" href="/"
        >{i18n.t("Back to the games board")}</NavigationLink
      >
    </div>
  </div>
{:else}
  <div class="mp">
    <div class="mp-empty">
      <p class="mp-empty-eyebrow">{i18n.t("Games board")}</p>
      <h1 class="mp-empty-title">{i18n.t("This game hit an error")}</h1>
      <p class="mp-empty-copy">
        {i18n.t("Try again, or check the")}
        <NavigationLink href="/">{i18n.t("games board")}</NavigationLink>
        {i18n.t("for what else is on.")}
      </p>
      <button
        type="button"
        class="button"
        onclick={() => {
          void refreshAll();
        }}
      >
        {i18n.t("Try again")}
      </button>
    </div>
  </div>
{/if}
