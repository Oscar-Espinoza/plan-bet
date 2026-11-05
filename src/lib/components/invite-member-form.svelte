<script lang="ts">
  import { refreshAll } from "$app/navigation";
  import { useTranslation } from "#lib/components/language.svelte";
  import Banner from "#lib/components/ui/banner.svelte";
  import Button from "#lib/components/ui/button.svelte";

  let { slug, onSent }: { slug: string; onSent?: () => void | Promise<void> } =
    $props();
  const i18n = useTranslation();
  let email = $state("");
  let error = $state("");
  let message = $state("");
  let pending = $state(false);
  let attempt = $state(0);

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    pending = true;
    const invited = email;
    const response = await fetch(`/api/groups/${slug}/invite`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    }).catch(() => null);
    pending = false;

    if (!response?.ok) {
      const payload: unknown = await response?.json().catch(() => null);
      const text =
        payload && typeof payload === "object" && "error" in payload
          ? String(
              (payload as { error: { message?: string } }).error?.message ?? "",
            )
          : "";
      error = text || "The invite did not go through. Try again.";
      attempt += 1;
      return;
    }
    const payload = (await response.json().catch(() => null)) as {
      data?: { emailed?: boolean };
    } | null;
    error = "";
    message = payload?.data?.emailed
      ? `Invited ${invited}. The invite link is on its way.`
      : `Invited ${invited}. Email delivery is not configured here, so no message was sent.`;
    attempt += 1;
    email = "";
    await (onSent ? onSent() : refreshAll());
  }
</script>

<form class="side-form" onsubmit={submit}>
  <label for="invite-email" class="field-label"
    >{i18n.t("Invite by email")}
  </label>
  <input
    id="invite-email"
    class="field"
    type="email"
    autocomplete="email"
    bind:value={email}
    required
  />

  {#if error}
    {#key attempt}
      <Banner tone="negative" role="alert">{i18n.t(error)}</Banner>
    {/key}
  {/if}
  {#if message}
    {#key attempt}
      <Banner tone="positive">{i18n.t(message)}</Banner>
    {/key}
  {/if}

  <Button type="submit" size="sm" disabled={pending || !email.trim()}>
    {i18n.t("Send invite")}
  </Button>
</form>
