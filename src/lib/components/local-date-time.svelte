<script lang="ts">
  import { intlLocale } from "#lib/shared/locale";
  import { formatDateTime, formatShortDate } from "#lib/shared/utils";
  import { useTranslation } from "./language.svelte";
  import { viewerClock } from "./clock.svelte";

  let {
    value,
    short = false,
    dateOnly,
  }: { value: string; short?: boolean; dateOnly?: string } = $props();

  const i18n = useTranslation();
  const clock = viewerClock();
</script>

{#if dateOnly}
  <time datetime={dateOnly}>
    {new Intl.DateTimeFormat(intlLocale(i18n.locale), {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${dateOnly}T00:00:00Z`))}
    · {i18n.t("Time TBD")}
  </time>
{:else}
  <time datetime={value}>
    {short
      ? formatShortDate(value, intlLocale(i18n.locale), clock.timeZone)
      : formatDateTime(value, intlLocale(i18n.locale), clock.timeZone)}
  </time>
{/if}
