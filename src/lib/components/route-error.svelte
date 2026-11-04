<script lang="ts">
  import type { Snippet } from "svelte";
  import AlertTriangle from "@lucide/svelte/icons/alert-triangle";
  import { useTranslation } from "./language.svelte";
  import Button from "./ui/button.svelte";

  let {
    title,
    copy,
    reset,
  }: {
    title: string;
    copy: string | Snippet;
    reset: () => void;
  } = $props();

  const i18n = useTranslation();
</script>

<div class="empty-state" style="min-height: 65vh">
  <div>
    <span class="empty-icon">
      <AlertTriangle aria-hidden="true" />
    </span>
    <p class="eyebrow">{i18n.t("Something went wrong")}</p>
    <h1 class="display-title">{i18n.t(title)}</h1>
    <p class="empty-copy">
      {#if typeof copy === "function"}
        {@render copy()}
      {:else}
        {i18n.t(copy)}
      {/if}
    </p>
    <Button class="mt-5" onclick={reset}>{i18n.t("Try again")}</Button>
  </div>
</div>
