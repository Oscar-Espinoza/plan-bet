<script lang="ts">
  import MailX from "@lucide/svelte/icons/mail-x";
  import AcceptInvite from "#lib/components/accept-invite.svelte";
  import { useTranslation } from "#lib/components/language.svelte";
  import Button from "#lib/components/ui/button.svelte";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();
  const i18n = useTranslation();
</script>

<svelte:head>
  <title>{data.title}</title>
</svelte:head>

{#if data.kind === "ready"}
  <AcceptInvite
    token={data.token}
    groupName={data.groupName}
    invitedByName={data.invitedByName}
  />
{:else if data.kind === "already"}
  <div class="empty-state">
    <div>
      <span class="empty-icon">
        <MailX aria-hidden="true" />
      </span>
      <h3 class="empty-title">{i18n.t("Already joined")}</h3>
      <p class="empty-copy">
        {i18n.t("You’re already in")}
        {data.groupName}.
      </p>
      <Button href="/groups/{data.groupSlug}" variant="secondary" class="mt-5">
        {i18n.t("Go to")}
        {data.groupName}
      </Button>
    </div>
  </div>
{:else}
  <div class="empty-state">
    <div>
      <span class="empty-icon">
        <MailX aria-hidden="true" />
      </span>
      <h3 class="empty-title">
        {data.kind === "unconfigured"
          ? i18n.t("Sign-in is not configured")
          : i18n.t("Invite not accepted")}
      </h3>
      <p class="empty-copy">
        {#if data.kind === "unconfigured"}
          {i18n.t(
            "This environment has no auth provider configured, so this invite cannot be accepted.",
          )}
        {:else if data.kind === "revoked"}
          {i18n.t("This invite was revoked. Ask the group for a new one.")}
        {:else if data.kind === "expired"}
          {i18n.t("This invite has expired. Ask the group for a new one.")}
        {:else}
          {i18n.t("This invite link is no longer valid.")}
        {/if}
      </p>
      <Button href="/groups" variant="secondary" class="mt-5">
        {i18n.t("Your groups")}
      </Button>
    </div>
  </div>
{/if}
