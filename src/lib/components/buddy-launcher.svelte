<script lang="ts">
  import MessageCircle from "@lucide/svelte/icons/message-circle";
  import type { Component } from "svelte";
  import { matchday } from "#lib/state/store.svelte";
  import { useTranslation } from "./language.svelte";
  import Button from "./ui/button.svelte";

  const i18n = useTranslation();
  let opened = $state(false);
  let loading = $state(false);
  let showOpening = $state(false);
  type BuddyModule = { default: Component<{ initiallyOpen?: boolean }> };
  let Dialog = $state<BuddyModule["default"] | null>(null);
  let buddyImport: Promise<BuddyModule> | null = null;

  function warmBuddy() {
    buddyImport ??= import("./buddy.svelte");
    return buddyImport;
  }

  async function open() {
    if (opened || loading) return;
    loading = true;
    const reveal = setTimeout(() => {
      showOpening = true;
    }, 150 /* --dur-swap */);
    try {
      const module = await warmBuddy();
      Dialog = module.default;
      opened = true;
    } finally {
      clearTimeout(reveal);
      showOpening = false;
      loading = false;
    }
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
      class="buddy-launcher buddy-launcher-enter"
      disabled={showOpening}
      aria-busy={showOpening || undefined}
      onpointerdown={warmBuddy}
      onfocus={warmBuddy}
      onclick={open}
    >
      {#if showOpening}
        {i18n.t("Opening Buddy…")}
      {:else}
        <MessageCircle aria-hidden="true" size={15} />
        {i18n.t("Buddy")}
      {/if}
    </Button>
  {/if}
{/if}
