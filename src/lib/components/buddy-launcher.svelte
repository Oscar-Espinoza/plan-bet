<script lang="ts">
  import MessageCircle from "@lucide/svelte/icons/message-circle";
  import type { Component } from "svelte";
  import { matchday } from "#lib/state/store.svelte";
  import { useTranslation } from "./language.svelte";
  import Button from "./ui/button.svelte";

  const i18n = useTranslation();
  let opened = $state(false);
  let loading = $state(false);
  let Dialog = $state<Component<{ initiallyOpen?: boolean }> | null>(null);

  async function open() {
    if (opened || loading) return;
    loading = true;
    const module = await import("./buddy.svelte");
    Dialog = module.default;
    opened = true;
    loading = false;
  }
</script>

{#if matchday.hydrated}
  {#if opened && Dialog}
    {@const Panel = Dialog}
    <Panel initiallyOpen />
  {:else}
    <Button
      variant="secondary"
      size="sm"
      class="buddy-launcher"
      disabled={loading}
      aria-busy={loading || undefined}
      onclick={open}
    >
      {#if loading}
        {i18n.t("Opening Buddy…")}
      {:else}
        <MessageCircle aria-hidden="true" size={15} />
        {i18n.t("Buddy")}
      {/if}
    </Button>
  {/if}
{/if}
