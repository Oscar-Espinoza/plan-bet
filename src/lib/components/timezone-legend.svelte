<script lang="ts">
  import { intlLocale } from "#lib/shared/locale";
  import { useTranslation } from "./language.svelte";
  import { viewerClock } from "./clock.svelte";

  const i18n = useTranslation();
  const clock = viewerClock();
  const zone = $derived(
    new Intl.DateTimeFormat(intlLocale(i18n.locale === "es" ? "es" : "en"), {
      timeZoneName: "short",
      timeZone: clock.timeZone,
    })
      .formatToParts(new Date(clock.now()))
      .find((part) => part.type === "timeZoneName")?.value,
  );
</script>

{#if zone}
  <p class="slate-tz">
    {i18n.t("All times")} <span>{zone}</span>
    {i18n.t("· your time")}
  </p>
{/if}
