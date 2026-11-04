<script lang="ts">
  import { page } from "$app/state";
  import DestinationPreview from "./navigation-preview.svelte";
  import { useNavigationPreview } from "./navigation.svelte";

  const navigation = useNavigationPreview();
  const pathname = $derived(page.url.pathname);
  const destination = $derived(navigation?.destination ?? null);
  const same = $derived(destination?.pathname === pathname);
</script>

<DestinationPreview
  href={same && destination ? destination.href : pathname}
  metadata={same ? destination?.metadata : undefined}
/>
