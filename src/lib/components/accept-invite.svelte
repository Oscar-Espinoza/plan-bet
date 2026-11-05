<script lang="ts">
  import { goto, refreshAll } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { asRoute } from "#lib/components/href";
  import { useTranslation } from "#lib/components/language.svelte";
  import Banner from "#lib/components/ui/banner.svelte";
  import Button from "#lib/components/ui/button.svelte";

  let {
    token,
    groupName,
    invitedByName,
  }: {
    token: string;
    groupName: string;
    invitedByName: string | null;
  } = $props();

  const i18n = useTranslation();
  let error = $state("");
  let pending = $state(false);
  let attempt = $state(0);

  async function join() {
    pending = true;
    const response = await fetch("/api/groups/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    }).catch(() => null);
    pending = false;

    const payload: unknown = await response?.json().catch(() => null);
    if (!response?.ok) {
      const text =
        payload && typeof payload === "object" && "error" in payload
          ? String(
              (payload as { error: { message?: string } }).error?.message ?? "",
            )
          : "";
      error = text || "That invite could not be accepted. Try again.";
      attempt += 1;
      return;
    }

    error = "";
    const data = (payload as { data: { groupSlug: string } }).data;
    await refreshAll();
    await goto(resolve(asRoute(`/groups/${data.groupSlug}`)));
  }
</script>

<div class="empty-state">
  <div>
    <h3 class="empty-title">
      {#if invitedByName}
        <strong>{invitedByName}</strong>
      {:else}
        {i18n.t("Someone")}
      {/if}
      {i18n.t("invited you to")}
      <strong>{groupName}</strong>
    </h3>
    <p class="empty-copy">
      {i18n.t(
        "Joining puts you on this group’s wager board. Credits are fictional and non-withdrawable — never real money.",
      )}
    </p>
    {#if error}
      {#key attempt}
        <Banner tone="negative" role="alert">{i18n.t(error)}</Banner>
      {/key}
    {/if}
    <Button type="button" class="mt-5" onclick={join} disabled={pending}>
      {i18n.t("Join")}
      {groupName}
    </Button>
  </div>
</div>
