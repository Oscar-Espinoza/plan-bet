<script lang="ts">
  import GameDetail from "#lib/components/game-detail.svelte";
  import DiscussionPanel from "#lib/components/matchup/discussion-panel.svelte";
  import SignedOutWager from "#lib/components/matchup/signed-out-wager.svelte";
  import WageringPanel from "#lib/components/matchup/wagering-panel.svelte";
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
      {:else if data.wagering}
        <WageringPanel
          wagering={data.wagering}
          sport={data.sport}
          finished={data.finished}
          home={data.home}
          away={data.away}
        />
      {/if}
    {/snippet}
    {#snippet socialPanel()}
      {#if data.socialDiscussion}
        <DiscussionPanel
          discussion={data.socialDiscussion}
          routeId={data.routeId}
          matchup={{ home: data.home, away: data.away }}
        />
      {/if}
    {/snippet}
  </GameDetail>
{/key}
