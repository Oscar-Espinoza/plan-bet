<script lang="ts">
  import { page } from "$app/state";
  import { refreshAll } from "$app/navigation";
  import SearchX from "@lucide/svelte/icons/search-x";
  import { useTranslation } from "#lib/components/language.svelte";
  import NavigationLink from "#lib/components/fast-link/navigation-link.svelte";
  import RouteError from "#lib/components/route-error.svelte";
  import Button from "#lib/components/ui/button.svelte";

  const i18n = useTranslation();
</script>

{#if page.status === 404}
  <div class="empty-state" style="min-height: 65vh">
    <div>
      <span class="empty-icon">
        <SearchX aria-hidden="true" />
      </span>
      <p class="eyebrow">{i18n.t("404 · Off the schedule")}</p>
      <h1 class="display-title">{i18n.t("Matchup not found")}</h1>
      <p class="empty-copy">
        {i18n.t(
          "That page does not exist. The games board has every upcoming fixture across soccer and baseball.",
        )}
      </p>
      <Button href="/" class="mt-5">{i18n.t("Back to the games board")}</Button>
    </div>
  </div>
{:else}
  <RouteError title="This page hit an error" reset={() => refreshAll()}>
    {#snippet copy()}
      {i18n.t("Try again, or head back to the")}
      <NavigationLink href="/">{i18n.t("games board")}</NavigationLink>.
    {/snippet}
  </RouteError>
{/if}
