<script lang="ts">
  import { refreshAll } from "$app/navigation";
  import { useTranslation } from "#lib/components/language.svelte";
  import Banner from "#lib/components/ui/banner.svelte";
  import Button from "#lib/components/ui/button.svelte";

  let {
    slug,
    initialUrl = "",
    initialInviteId = "",
  }: {
    slug: string;
    initialUrl?: string;
    initialInviteId?: string;
  } = $props();

  const i18n = useTranslation();
  let url = $state(initialUrl);
  let inviteId = $state(initialInviteId);
  let copied = $state(false);
  let error = $state("");
  let confirmingRevoke = $state(false);
  let pending = $state(false);
  let attempt = $state(0);
  let copyTimer: ReturnType<typeof setTimeout> | undefined;

  async function createLink() {
    pending = true;
    const response = await fetch(`/api/groups/${slug}/link`, {
      method: "POST",
    }).catch(() => null);
    pending = false;

    if (!response?.ok) {
      error = "The join link did not load. Try again.";
      attempt += 1;
      return;
    }
    const payload = (await response.json().catch(() => null)) as {
      data?: { url?: string; inviteId?: string };
    } | null;
    if (!payload?.data?.url || !payload.data.inviteId) {
      error = "The join link did not load. Try again.";
      attempt += 1;
      return;
    }
    error = "";
    url = payload.data.url;
    inviteId = payload.data.inviteId;
    await refreshAll();
  }

  async function copy() {
    try {
      await navigator.clipboard?.writeText(url);
      copied = true;
      if (copyTimer !== undefined) clearTimeout(copyTimer);
      copyTimer = setTimeout(() => {
        copied = false;
        copyTimer = undefined;
      }, 2000);
    } catch {
      // The visible input is still there to select and copy by hand.
    }
  }

  async function revoke() {
    pending = true;
    const response = await fetch(`/api/groups/${slug}/invites/${inviteId}`, {
      method: "DELETE",
    }).catch(() => null);
    pending = false;

    if (!response?.ok) {
      error = "The link did not revoke. Try again.";
      attempt += 1;
      return;
    }
    error = "";
    url = "";
    inviteId = "";
    copied = false;
    if (copyTimer !== undefined) clearTimeout(copyTimer);
    await refreshAll();
  }
</script>

<div class="side-form">
  <span class="field-label">{i18n.t("Join link")}</span>
  {#if url}
    <div class="enter">
      <input
        class="field"
        readonly
        value={url}
        onfocus={(event) => event.currentTarget.select()}
        aria-label={i18n.t("Group join link")}
      />
      <div class="mt-2 flex gap-2">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onclick={copy}
          disabled={pending}
        >
          <span class="label-swap">
            <span aria-hidden={copied}>{i18n.t("Copy")}</span>
            <span aria-hidden={!copied}>{i18n.t("Copied")}</span>
          </span>
        </Button>
        {#if !confirmingRevoke}
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onclick={() => (confirmingRevoke = true)}
            disabled={pending}
          >
            {i18n.t("Revoke")}
          </Button>
        {/if}
      </div>
      {#if confirmingRevoke}
        <div class="revoke-confirm enter" role="group">
          <p class="fine-print">
            {i18n.t("Anyone holding this link will no longer be able to join.")}
          </p>
          <div class="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="danger"
              onclick={() => {
                confirmingRevoke = false;
                void revoke();
              }}
              disabled={pending}
            >
              {i18n.t("Revoke link")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onclick={() => (confirmingRevoke = false)}
            >
              {i18n.t("Cancel")}
            </Button>
          </div>
        </div>
      {/if}
    </div>
  {:else}
    <Button type="button" size="sm" onclick={createLink} disabled={pending}>
      {i18n.t("Create join link")}
    </Button>
  {/if}
  {#if error}
    {#key attempt}
      <Banner tone="negative" role="alert">{i18n.t(error)}</Banner>
    {/key}
  {/if}
</div>
