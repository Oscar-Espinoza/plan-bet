<script lang="ts">
  import type { Snippet } from "svelte";
  import { provideRequestClock } from "./clock.svelte";

  let {
    zone,
    now,
    children,
  }: { zone: string; now: number; children: Snippet } = $props();

  provideRequestClock({
    get zone() {
      return zone;
    },
    get now() {
      return now;
    },
  });

  $effect(() => {
    const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!browserZone || browserZone === zone) return;
    const secure = location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `tz=${browserZone}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
  });
</script>

{@render children()}
