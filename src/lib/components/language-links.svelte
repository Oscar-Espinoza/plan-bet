<script lang="ts">
  import { useSetLocale } from "./language.svelte";

  const locale = useSetLocale();
  const options = [
    ["es", "Español"],
    ["en", "English"],
  ] as const;
</script>

<span
  class="language-links"
  role="group"
  aria-label={locale.locale === "es" ? "Idioma" : "Language"}
>
  {#each options as [value, label] (value)}
    <button
      type="button"
      lang={value}
      aria-pressed={locale.current === value}
      disabled={locale.pending}
      onclick={() => locale.current !== value && locale.choose(value)}
    >
      {label}
    </button>
  {/each}
</span>
