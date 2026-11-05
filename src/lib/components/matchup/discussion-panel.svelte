<script lang="ts">
  import { tick } from "svelte";
  import type { SocialDiscussionView } from "#lib/shared/comment-view";
  import { arrive } from "../motion";
  import GroupDiscussion from "./group-discussion.svelte";

  let {
    discussion,
    routeId,
    matchup,
  }: {
    discussion: Promise<SocialDiscussionView | null>;
    routeId: string;
    matchup?: { home: string; away: string };
  } = $props();

  const mountedAt = performance.now();
  let shown = $state<SocialDiscussionView | null | undefined>();
  let root = $state<HTMLDivElement | null>(null);

  $effect(() => {
    const request = discussion;
    let active = true;
    void request.then(
      (value) => {
        if (!active) return;
        const first = shown === undefined;
        shown = value;
        if (first && value) {
          void tick().then(() => arrive(root, mountedAt, 0));
        }
      },
      () => {
        // Pending and a rejection after the first resolve leave the panel.
      },
    );
    return () => {
      active = false;
    };
  });
</script>

{#if shown}
  <div bind:this={root}>
    <GroupDiscussion {routeId} discussion={shown} {matchup} />
  </div>
{/if}
