<script lang="ts">
  import { goto, refreshAll } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { asRoute } from "#lib/components/href";
  import { useTranslation } from "#lib/components/language.svelte";
  import Banner from "#lib/components/ui/banner.svelte";
  import Button from "#lib/components/ui/button.svelte";

  const i18n = useTranslation();
  let name = $state("");
  let error = $state("");
  let pending = $state(false);
  let attempt = $state(0);

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    pending = true;
    const response = await fetch("/api/groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
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
      error = text || "The group was not created. Try again.";
      attempt += 1;
      return;
    }
    error = "";
    const payload = (await response.json()) as {
      data: { group: { slug: string } };
    };
    await refreshAll();
    await goto(resolve(asRoute(`/groups/${payload.data.group.slug}`)));
  }
</script>

<form class="side-form" onsubmit={submit}>
  <label for="group-name" class="field-label">{i18n.t("Group name")} </label>
  <input
    id="group-name"
    class="field"
    type="text"
    bind:value={name}
    maxlength="80"
    required
  />

  {#if error}
    {#key attempt}
      <Banner tone="negative" role="alert">{i18n.t(error)}</Banner>
    {/key}
  {/if}

  <Button type="submit" class="w-full" disabled={pending || !name.trim()}>
    <span class="label-swap">
      <span aria-hidden={pending}>{i18n.t("Create group")}</span>
      <span aria-hidden={!pending}>{i18n.t("Creating…")}</span>
    </span>
  </Button>
</form>
