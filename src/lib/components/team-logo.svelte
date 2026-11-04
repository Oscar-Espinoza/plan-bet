<script lang="ts">
  let { src, priority = false }: { src?: string; priority?: boolean } =
    $props();
  let failedSrc = $state<string | undefined>(undefined);
  const missing = $derived(!src || src === failedSrc);
  const localWebp = $derived(
    src?.startsWith("/") && src.endsWith(".webp")
      ? { avif: src.replace(/\.webp$/, ".avif"), webp: src }
      : null,
  );
</script>

<span class="team-logo" aria-hidden="true">
  {#if missing}
    <svg
      viewBox="0 0 24 24"
      width="100%"
      height="100%"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
    >
      <path d="M12 3 4 6v6c0 4 4 7 8 9 4-2 8-5 8-9V6Z" />
      <path d="M9 12h6" />
    </svg>
  {:else if localWebp}
    <picture>
      <source srcset={localWebp.avif} type="image/avif" />
      <source srcset={localWebp.webp} type="image/webp" />
      <img
        src={localWebp.webp}
        alt=""
        width="64"
        height="64"
        decoding="async"
        loading={priority ? "eager" : "lazy"}
        fetchpriority={priority ? "high" : "auto"}
        referrerpolicy="no-referrer"
        onerror={() => (failedSrc = src)}
      />
    </picture>
  {:else}
    <img
      {src}
      alt=""
      width="64"
      height="64"
      decoding="async"
      loading={priority ? "eager" : "lazy"}
      fetchpriority={priority ? "high" : "auto"}
      referrerpolicy="no-referrer"
      onerror={() => (failedSrc = src)}
    />
  {/if}
</span>
