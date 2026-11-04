<script lang="ts">
  import type { Snippet } from "svelte";
  import { page } from "$app/state";
  import { useTranslation } from "#lib/components/language.svelte";

  let {
    overview,
    members,
    action,
  }: {
    overview: Snippet;
    members: Snippet;
    action?: Snippet;
  } = $props();

  const i18n = useTranslation();
  const uid = $props.id();
  const labels = ["Overview", "Members"] as const;

  let active = $state(page.url.searchParams.get("tab") === "members" ? 1 : 0);
  let seenTab = $state<string | null | undefined>(undefined);

  $effect(() => {
    const tab = page.url.searchParams.get("tab");
    if (seenTab === undefined) {
      seenTab = tab;
      if (tab === "members") {
        document.getElementById("invite")?.scrollIntoView({ block: "start" });
      }
      return;
    }
    if (tab === seenTab) return;
    seenTab = tab;
    if (tab === "members") {
      active = 1;
      document.getElementById("invite")?.scrollIntoView({ block: "start" });
    }
  });

  function onKeydown(event: KeyboardEvent, index: number) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home" ? 0 : event.key === "End" ? 1 : 1 - index;
    active = next;
    document.getElementById(`${uid}-tab-${next}`)?.focus();
  }
</script>

<div class="group-tabs-bar">
  <div class="group-tabs" role="tablist" aria-label={i18n.t("Group sections")}>
    {#each labels as label, index (label)}
      <button
        type="button"
        role="tab"
        id="{uid}-tab-{index}"
        aria-controls="{uid}-panel-{index}"
        aria-selected={active === index}
        tabindex={active === index ? 0 : -1}
        onclick={() => (active = index)}
        onkeydown={(event) => onKeydown(event, index)}
      >
        {i18n.t(label)}
      </button>
    {/each}
  </div>
  {#if action}
    {@render action()}
  {/if}
</div>
{#each [overview, members] as content, index (index)}
  <div
    role="tabpanel"
    id="{uid}-panel-{index}"
    aria-labelledby="{uid}-tab-{index}"
    hidden={active !== index}
    tabindex="0"
  >
    {@render content()}
  </div>
{/each}
