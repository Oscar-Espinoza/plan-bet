<script lang="ts">
  import StadiumPreload from "#lib/components/stadium-preload.svelte";
  import Slate from "#lib/components/slate.svelte";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();
</script>

<StadiumPreload />
<Slate data={data.data} sport={data.sport} />
