<script lang="ts">
  import type { Snippet } from "svelte";
  import { registerSpanish, type Locale } from "#lib/shared/locale";
  import { provideLocale } from "./language.svelte";

  let {
    locale,
    messages = null,
    children,
  }: {
    locale: Locale;
    messages?: Record<string, string> | null;
    children: Snippet;
  } = $props();

  function sync(next: Locale, dictionary: Record<string, string> | null) {
    if (next === "es" && dictionary) registerSpanish(dictionary);
  }

  // Register before the first child render. The closure keeps the prop read
  // legal under the state_referenced_locally check; $effect.pre covers updates.
  const register = () => sync(locale, messages);
  register();
  $effect.pre(register);

  provideLocale({
    get locale() {
      return locale;
    },
  });
</script>

{@render children()}
