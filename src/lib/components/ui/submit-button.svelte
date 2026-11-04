<script lang="ts">
  import type { Snippet } from "svelte";
  import type { HTMLButtonAttributes } from "svelte/elements";
  import { afterNavigate } from "$app/navigation";
  import { page } from "$app/state";
  import Button from "./button.svelte";

  type Props = Omit<HTMLButtonAttributes, "children"> & {
    pendingLabel: string;
    children?: Snippet;
    variant?: "primary" | "secondary" | "ghost" | "danger";
    size?: "default" | "sm" | "icon";
  };

  let { children, pendingLabel, disabled = false, ...props }: Props = $props();

  let pending = $state(false);
  let button = $state<HTMLButtonElement | HTMLAnchorElement | null>(null);
  let snapshot = "";

  $effect(() => {
    const form = button instanceof HTMLButtonElement ? button.form : null;
    if (!form) return;
    const onSubmit = () => {
      pending = true;
      snapshot = `${page.url.href}|${page.status}|${page.form ? "1" : "0"}`;
    };
    form.addEventListener("submit", onSubmit);
    return () => form.removeEventListener("submit", onSubmit);
  });

  $effect(() => {
    const next = `${page.url.href}|${page.status}|${page.form ? "1" : "0"}`;
    if (pending && snapshot && next !== snapshot) pending = false;
  });

  afterNavigate(() => {
    pending = false;
  });
</script>

<Button
  {...props}
  type="submit"
  disabled={pending || disabled}
  aria-busy={pending}
  bind:element={button}
>
  {#if pending}
    {pendingLabel}
  {:else}
    {@render children?.()}
  {/if}
</Button>
