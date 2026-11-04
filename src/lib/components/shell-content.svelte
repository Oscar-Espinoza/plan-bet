<script lang="ts">
  import type { Snippet } from "svelte";
  import { page } from "$app/state";
  import ArrowLeft from "@lucide/svelte/icons/arrow-left";
  import CircleDot from "@lucide/svelte/icons/circle-dot";
  import UserRound from "@lucide/svelte/icons/user-round";
  import UsersRound from "@lucide/svelte/icons/users-round";
  import { cn } from "#lib/shared/utils";
  import { bandHeight } from "./band-height";
  import { CRUMB_SLOT_ID } from "./breadcrumb-portal.svelte";
  import HydrateStore from "./hydrate-store.svelte";
  import { useTranslation } from "./language.svelte";
  import LanguageLinks from "./language-links.svelte";
  import { useNavigationPreview } from "./navigation.svelte";
  import DestinationPreview from "./navigation-preview.svelte";
  import BuddyLauncher from "./buddy-launcher.svelte";
  import TourBar from "./tour-bar.svelte";
  import LocalLink from "./fast-link/local-link.svelte";
  import NavigationLink from "./fast-link/navigation-link.svelte";

  const navItems = [
    { href: "/", label: "Games", icon: CircleDot },
    { href: "/you", label: "You", icon: UserRound },
    { href: "/groups", label: "Groups", icon: UsersRound },
  ];

  let {
    children,
    accountControl,
  }: { children: Snippet; accountControl?: Snippet } = $props();

  const i18n = useTranslation();
  const gap = " ";
  const navigation = useNavigationPreview();
  let scroller = $state<HTMLDivElement | null>(null);

  const pending = $derived(navigation?.pending ?? null);
  const pathname = $derived(pending?.pathname ?? page.url.pathname);
  const onGame = $derived(pathname.startsWith("/games/"));
  const showTour = $derived(!pending && (pathname === "/" || onGame));
  const showBuddy = $derived(!pending && pathname !== "/" && !onGame);

  function isCurrent(href: string) {
    if (href === "/") return pathname === "/" || pathname.startsWith("/games/");
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  $effect(() => {
    const current = pending;
    const element = scroller;
    if (!current || !element) return;
    const previousTop = element.scrollTop;
    element.scrollTop = 0;
    return () => {
      element.scrollTop = previousTop;
    };
  });
</script>

<div class="app-shell">
  <HydrateStore />
  <a class="skip-link" href="#main-content">{i18n.t("Skip to main content")}</a>
  <div class="workspace">
    <header class="topbar">
      <div class="topbar-inner">
        {#if onGame}
          <NavigationLink href="/" class="shell-back">
            <ArrowLeft aria-hidden="true" size={24} />
            <span class="sr-only">{i18n.t("Back to games")}</span>
          </NavigationLink>
        {/if}
        <NavigationLink
          href="/"
          class="brand"
          aria-label={i18n.t("Matchday Plan home")}
          preloadCode="off"
          preloadData="off"
        >
          <span class="brand-mark">MP</span>
          <span class="brand-name">Matchday Plan</span>
        </NavigationLink>
        <div id={CRUMB_SLOT_ID} class="topbar-crumb"></div>
        <nav class="topbar-nav" aria-label={i18n.t("Primary navigation")}>
          {#each navItems as item (item.href)}
            {@const Icon = item.icon}
            {@const active = isCurrent(item.href)}
            <LocalLink
              class={cn("nav-link", active && "nav-link-active")}
              href={item.href}
              aria-current={active ? "page" : undefined}
            >
              <Icon aria-hidden="true" size={17} />
              {i18n.t(item.label)}
            </LocalLink>
          {/each}
        </nav>
        <div class="topbar-controls">
          {#if accountControl}
            {@render accountControl()}
          {/if}
        </div>
      </div>
    </header>
    {#key page.url.pathname}
      <div class="workspace-scroll" bind:this={scroller}>
        <main id="main-content" class="main-content" tabindex="-1">
          {#if pending}
            <div
              class="navigation-preview"
              data-navigation-preview={pending.pathname}
            >
              <DestinationPreview
                href={pending.href}
                metadata={pending.metadata}
              />
            </div>
          {/if}
          <div
            class="route-content"
            hidden={Boolean(pending)}
            inert={pending ? true : undefined}
          >
            {@render children()}
          </div>
        </main>
        <footer class="app-footer">
          <p class="fine-print">
            {i18n.t("Source data:")}{gap}
            <a
              href="https://www.football-data.org/"
              target="_blank"
              rel="noreferrer">football-data.org</a
            >,{gap}
            <a href="https://statsapi.mlb.com/" target="_blank" rel="noreferrer"
              >MLB Stats API</a
            >
            {i18n.t(", and")}{gap}
            <a
              href="https://baseballsavant.mlb.com/"
              target="_blank"
              rel="noreferrer">Baseball Savant</a
            >.
            <NavigationLink href="/rules">{i18n.t("Rules")}</NavigationLink>
            ·{gap}
            <NavigationLink href="/system">{i18n.t("System")}</NavigationLink>
            · <LanguageLinks />
          </p>
          <p class="fine-print">
            {i18n.t(
              "Credits are fictional and non-withdrawable. Not a sportsbook.",
            )}
          </p>
        </footer>
      </div>
    {/key}
  </div>
  <nav
    class="mobile-nav"
    aria-label={i18n.t("Mobile navigation")}
    use:bandHeight={"--nav-h"}
  >
    {#each navItems as item (item.href)}
      {@const Icon = item.icon}
      {@const active = isCurrent(item.href)}
      <LocalLink
        class={cn("mobile-nav-link", active && "mobile-nav-link-active")}
        href={item.href}
        aria-current={active ? "page" : undefined}
      >
        <Icon aria-hidden="true" size={18} />
        {i18n.t(item.label)}
      </LocalLink>
    {/each}
  </nav>
  {#if showTour}
    <TourBar />
  {/if}
  {#if showBuddy}
    <BuddyLauncher />
  {/if}
</div>
