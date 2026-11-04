<script lang="ts">
  import GameDetail from "#lib/components/game-detail.svelte";
  import SignedOutWager from "#lib/components/matchup/signed-out-wager.svelte";
  import StadiumPreload from "#lib/components/stadium-preload.svelte";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();
</script>

<svelte:head>
  <title>{data.title}</title>
  <meta name="description" content={data.description} />
</svelte:head>

<StadiumPreload />
{#key data.routeId}
  <GameDetail view={data.view}>
    {#snippet wageringPanel()}
      {#if data.signedOut}
        <SignedOutWager routeId={data.routeId} finished={data.finished} />
      {/if}
    {/snippet}
  </GameDetail>
{/key}
