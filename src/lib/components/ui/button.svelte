<script lang="ts">
  import { resolve } from "$app/paths";
  import type { Snippet } from "svelte";
  import { asRoute } from "../href";
  import type {
    HTMLAnchorAttributes,
    HTMLButtonAttributes,
  } from "svelte/elements";
  import { cn } from "#lib/shared/utils";

  type Props = Omit<HTMLButtonAttributes, "children"> & {
    variant?: "primary" | "secondary" | "ghost" | "danger";
    size?: "default" | "sm" | "icon";
    href?: string;
    children?: Snippet;
    element?: HTMLButtonElement | HTMLAnchorElement | null;
  };

  let {
    class: className = "",
    variant = "primary",
    size = "default",
    href,
    type = "button",
    children,
    element = $bindable(null),
    ...rest
  }: Props = $props();

  const classes = $derived(
    cn(
      "button",
      variant === "secondary" && "button-secondary",
      variant === "ghost" && "button-ghost",
      variant === "danger" && "button-danger",
      size === "sm" && "button-sm",
      size === "icon" && "button-icon",
      className,
    ),
  );
</script>

{#if href}
  <a
    href={resolve(asRoute(href))}
    class={classes}
    bind:this={element}
    {...rest as HTMLAnchorAttributes}
  >
    {@render children?.()}
  </a>
{:else}
  <button {type} class={classes} bind:this={element} {...rest}>
    {@render children?.()}
  </button>
{/if}
