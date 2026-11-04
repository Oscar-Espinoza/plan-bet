<script lang="ts">
  import { intlLocale } from "#lib/shared/locale";
  import { useTranslation } from "./language.svelte";
  import { viewerClock } from "./clock.svelte";

  let { value, timeTbd = false }: { value: string; timeTbd?: boolean } =
    $props();
  const i18n = useTranslation();
  const clock = viewerClock();

  function clockAt(kickoff: string, locale: string, timeZone?: string) {
    return new Intl.DateTimeFormat(intlLocale(locale === "es" ? "es" : "en"), {
      hour: "numeric",
      hourCycle: locale === "es" ? "h23" : undefined,
      minute: "2-digit",
      timeZone,
    }).format(new Date(kickoff));
  }
</script>

{#if timeTbd}
  <span aria-label={i18n.t("Time TBD")} title={i18n.t("Time TBD")}
    >{i18n.t("TBD")}</span
  >
{:else}
  <time datetime={value}>{clockAt(value, i18n.locale, clock.timeZone)}</time>
{/if}
