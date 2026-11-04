<script lang="ts">
  import type { Locale } from "#lib/shared/locale";
  import { useSetLocale } from "./language.svelte";

  const locale = useSetLocale();

  function onchange(event: Event) {
    const value = (event.currentTarget as HTMLSelectElement).value;
    locale.choose(value === "es" ? "es" : "en");
  }
</script>

<select
  class="language-switch"
  aria-label={locale.locale === "es" ? "Idioma" : "Language"}
  value={locale.pending ? locale.selected : locale.locale}
  disabled={locale.pending}
  {onchange}
>
  <option value="en" label="EN">English</option>
  <option value={"es" satisfies Locale} label="ES">Español</option>
</select>
