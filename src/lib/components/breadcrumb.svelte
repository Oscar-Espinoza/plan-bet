<script lang="ts">
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import { useTranslation } from "./language.svelte";
  import BreadcrumbPortal from "./breadcrumb-portal.svelte";
  import NavigationLink from "./fast-link/navigation-link.svelte";

  type Crumb = { label: string; href?: string };

  let { items }: { items: Crumb[] } = $props();
  const i18n = useTranslation();
  const crumbs = $derived([{ label: i18n.t("Games"), href: "/" }, ...items]);
</script>

<BreadcrumbPortal>
  <nav class="breadcrumb" aria-label={i18n.t("Breadcrumb")}>
    <ol>
      {#each crumbs as crumb, index (`${index}-${crumb.label}`)}
        {@const current = index === crumbs.length - 1}
        <li>
          {#if current || !crumb.href}
            <span aria-current={current ? "page" : undefined}
              >{crumb.label}</span
            >
          {:else}
            <NavigationLink href={crumb.href}>{crumb.label}</NavigationLink>
          {/if}
          {#if !current}
            <ChevronRight aria-hidden="true" size={14} />
          {/if}
        </li>
      {/each}
    </ol>
  </nav>
</BreadcrumbPortal>
