<script lang="ts">
  import GameThread from "./game-thread.svelte";
  import { useTranslation } from "../language.svelte";
  import type { SocialDiscussionView } from "#lib/shared/comment-view";

  let {
    routeId,
    discussion,
    matchup,
  }: {
    routeId: string;
    discussion: SocialDiscussionView;
    matchup?: { home: string; away: string };
  } = $props();

  const i18n = useTranslation();
</script>

<section
  class="group-discussion"
  id="group-discussion"
  aria-labelledby="group-discussion-heading"
>
  <h2 id="group-discussion-heading">{i18n.t("Group discussion")}</h2>
  {#each discussion.threads as thread (thread.groupId)}
    <GameThread {routeId} {thread} {matchup} />
  {/each}
</section>
