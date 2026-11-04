<script lang="ts">
  import type { Snippet } from "svelte";
  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { page } from "$app/state";
  import { asRoute } from "./href";
  import { useTranslation } from "./language.svelte";
  import type { Message } from "#lib/shared/locale";

  type Panel = { key: string; label: Message; content: Snippet };

  let {
    panels,
    label,
    initial,
  }: {
    panels: Panel[];
    label: Message;
    initial: string;
  } = $props();

  const i18n = useTranslation();
  const uid = $props.id();
  const keys = $derived(panels.map((panel) => panel.key));
  const firstKey = $derived(keys[0] ?? "");

  // Seed once from the URL (or the server's initial tab). Later clicks own
  // the selection; back/forward writes the URL, which this effect follows.
  const seed = () => {
    const list = panels.map((panel) => panel.key);
    const first = list[0] ?? "";
    const param = page.url.searchParams.get("tab");
    if (param && list.includes(param)) return param;
    if (list.includes(initial)) return initial;
    return first;
  };
  let active = $state(seed());
  let seenParam = $state<string | null | undefined>(undefined);

  $effect.pre(() => {
    const param = page.url.searchParams.get("tab");
    if (seenParam === undefined) {
      seenParam = param;
      return;
    }
    if (param !== seenParam) {
      seenParam = param;
      if (param && keys.includes(param)) active = param;
    }
  });

  $effect(() => {
    if (seenParam === undefined) return;
    const url = new URL(page.url.href);
    if ((url.searchParams.get("tab") ?? firstKey) === active) return;
    if (active === firstKey) url.searchParams.delete("tab");
    else url.searchParams.set("tab", active);
    seenParam = url.searchParams.get("tab");
    void goto(resolve(asRoute(`${url.pathname}${url.search}${url.hash}`)), {
      replace: true,
      shallow: true,
      state: page.state,
    });
  });

  function onKeydown(event: KeyboardEvent, index: number) {
    const moves: Record<string, number> = {
      ArrowLeft: index - 1,
      ArrowRight: index + 1,
      Home: 0,
      End: panels.length - 1,
    };
    const next = moves[event.key];
    if (next === undefined) return;
    event.preventDefault();
    const target = panels[(next + panels.length) % panels.length];
    if (!target) return;
    active = target.key;
    document.getElementById(`${uid}-tab-${target.key}`)?.focus();
  }
</script>

<div class="section-tabs" role="tablist" aria-label={i18n.t(label)}>
  {#each panels as panel, index (panel.key)}
    <button
      type="button"
      role="tab"
      id={`${uid}-tab-${panel.key}`}
      aria-controls={`${uid}-panel-${panel.key}`}
      aria-selected={active === panel.key}
      tabindex={active === panel.key ? 0 : -1}
      onclick={() => (active = panel.key)}
      onkeydown={(event) => onKeydown(event, index)}
    >
      {i18n.t(panel.label)}
    </button>
  {/each}
</div>
{#each panels as panel (panel.key)}
  <div
    role="tabpanel"
    id={`${uid}-panel-${panel.key}`}
    aria-labelledby={`${uid}-tab-${panel.key}`}
    hidden={active !== panel.key}
    tabindex="0"
  >
    {@render panel.content()}
  </div>
{/each}
