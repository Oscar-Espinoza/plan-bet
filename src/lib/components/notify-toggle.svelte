<script lang="ts">
  import { refreshAll } from "$app/navigation";
  import { useTranslation } from "#lib/components/language.svelte";
  import Banner from "#lib/components/ui/banner.svelte";
  import Button from "#lib/components/ui/button.svelte";

  let { slug, enabled }: { slug: string; enabled: boolean } = $props();
  const i18n = useTranslation();
  let on = $state(enabled);
  let error = $state("");
  let pending = $state(false);

  async function toggle() {
    const next = !on;
    pending = true;
    error = "";
    const response = await fetch(`/api/groups/${slug}/notifications`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notifyOnActivity: next }),
    }).catch(() => null);
    pending = false;

    if (!response?.ok) {
      error = "That setting did not save. Try again.";
      return;
    }
    on = next;
    await refreshAll();
  }
</script>

<div class="side-form">
  <Button
    type="button"
    variant="secondary"
    size="sm"
    onclick={toggle}
    disabled={pending}
    aria-pressed={on}
  >
    {i18n.t("Email me group activity:")}
    {on ? i18n.t("enabled") : i18n.t("disabled")}
  </Button>
  <p class="fine-print">
    {on
      ? i18n.t(
          "You get an email when a member places a wager here and when group wagers settle.",
        )
      : i18n.t("You get no group emails. Activity still shows on this page.")}
  </p>
  {#if error}
    <Banner tone="negative" role="alert">{i18n.t(error)}</Banner>
  {/if}
</div>
