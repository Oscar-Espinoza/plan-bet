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
  let attempt = $state(0);

  async function toggle() {
    const next = !on;
    pending = true;
    const response = await fetch(`/api/groups/${slug}/notifications`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notifyOnActivity: next }),
    }).catch(() => null);
    pending = false;

    if (!response?.ok) {
      error = "That setting did not save. Try again.";
      attempt += 1;
      return;
    }
    error = "";
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
    <span class="label-swap">
      <span aria-hidden={!on}>{i18n.t("enabled")}</span>
      <span aria-hidden={on}>{i18n.t("disabled")}</span>
    </span>
  </Button>
  <p class="fine-print">
    <span class="label-swap">
      <span aria-hidden={!on}>
        {i18n.t(
          "You get an email when a member places a wager here and when group wagers settle.",
        )}
      </span>
      <span aria-hidden={on}>
        {i18n.t("You get no group emails. Activity still shows on this page.")}
      </span>
    </span>
  </p>
  {#if error}
    {#key attempt}
      <Banner class="enter" tone="negative" role="alert">{i18n.t(error)}</Banner
      >
    {/key}
  {/if}
</div>
