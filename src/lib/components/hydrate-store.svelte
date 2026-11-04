<script lang="ts">
  import { matchday } from "#lib/state/store.svelte";

  $effect(() => {
    matchday.hydrate();
  });
</script>
