<script lang="ts">
  import { page } from "$app/state";
  import { refreshAll } from "$app/navigation";
  import { slowConnection } from "./connection";

  const INTERVAL = 60_000;

  function shouldSkip() {
    if (slowConnection()) return true;
    const active = document.activeElement;
    return (
      active instanceof HTMLInputElement ||
      active instanceof HTMLTextAreaElement ||
      active instanceof HTMLSelectElement
    );
  }

  $effect(() => {
    const pathname = page.url.pathname;
    if (!(
      pathname === "/" ||
      pathname === "/you" ||
      pathname.startsWith("/games/") ||
      pathname.startsWith("/groups")
    )) {
      return;
    }
    let last = Date.now();
    let inFlight = false;
    const refresh = () => {
      if (
        document.visibilityState !== "visible" ||
        inFlight ||
        Date.now() - last < INTERVAL ||
        shouldSkip()
      ) {
        return;
      }
      last = Date.now();
      inFlight = true;
      void import("./navigation-cache")
        .then(async ({ clearNavigationCache }) => {
          clearNavigationCache();
          await refreshAll();
        })
        .finally(() => {
          inFlight = false;
        });
    };
    const timer = window.setInterval(refresh, INTERVAL);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  });
</script>
