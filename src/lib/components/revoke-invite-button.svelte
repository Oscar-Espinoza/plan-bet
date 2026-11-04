<script lang="ts">
  import { refreshAll } from "$app/navigation";
  import { useTranslation } from "#lib/components/language.svelte";
  import Button from "#lib/components/ui/button.svelte";

  let { slug, inviteId }: { slug: string; inviteId: string } = $props();
  const i18n = useTranslation();
  let pending = $state(false);

  async function revoke() {
    pending = true;
    const response = await fetch(`/api/groups/${slug}/invites/${inviteId}`, {
      method: "DELETE",
    }).catch(() => null);
    pending = false;
    if (response?.ok) await refreshAll();
  }
</script>

<Button
  type="button"
  size="sm"
  variant="secondary"
  onclick={revoke}
  disabled={pending}
>
  {i18n.t("Revoke")}
</Button>
