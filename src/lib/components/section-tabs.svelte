<script lang="ts">
  import type { Snippet } from "svelte";
  import { tick } from "svelte";
  import { page } from "$app/state";
  import { useTranslation } from "./language.svelte";
  import { fade } from "#lib/components/motion";
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

  // Back/forward updates `page.url`. A click does not: the URL is mirrored
  // with history.replaceState, same as legacy, so a tab switch never refetches.
  $effect.pre(() => {
    const param = page.url.searchParams.get("tab");
    if (seenParam === undefined) {
      seenParam = param;
      return;
    }
    if (param === seenParam) return;
    seenParam = param;
    const next = param && keys.includes(param) ? param : firstKey;
    if (active !== next) active = next;
  });

  $effect(() => {
    const key = active;
    const first = firstKey;
    const url = new URL(window.location.href);
    if ((url.searchParams.get("tab") ?? first) === key) return;
    if (key === first) url.searchParams.delete("tab");
    else url.searchParams.set("tab", key);
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
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
  function select(key: string) {
    active = key;
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
      data-label={i18n.t(panel.label)}
      onclick={(event) => {
        select(panel.key);
        if (event.detail > 0)
          void tick().then(() =>
            fade(document.getElementById(`${uid}-panel-${panel.key}`), 0.6),
          );
      }}
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
