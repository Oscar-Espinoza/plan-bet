<script lang="ts">
  import Plus from "@lucide/svelte/icons/plus";
  import UsersRound from "@lucide/svelte/icons/users-round";
  import Breadcrumb from "#lib/components/breadcrumb.svelte";
  import GroupList from "#lib/components/group-list.svelte";
  import { useTranslation } from "#lib/components/language.svelte";
  import Button from "#lib/components/ui/button.svelte";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();
  const i18n = useTranslation();
</script>

<svelte:head>
  <title>{data.title}</title>
</svelte:head>

{#if data.status === "unconfigured"}
  <header class="page-heading">
    <Breadcrumb items={[{ label: i18n.t("Groups") }]} />
    <div>
      <p class="eyebrow">{i18n.t("Group wagers")}</p>
      <h1 class="display-title">{i18n.t("Groups")}</h1>
    </div>
  </header>
  <div class="empty-state">
    <div>
      <span class="empty-icon">
        <UsersRound aria-hidden="true" />
      </span>
      <h3 class="empty-title">{i18n.t("Sign-in is not configured")}</h3>
      <p class="empty-copy">
        {i18n.t(
          "This environment has no auth provider configured, so there are no groups to show.",
        )}
      </p>
    </div>
  </div>
{:else}
  <header class="page-heading">
    <Breadcrumb items={[{ label: i18n.t("Groups") }]} />
    <div>
      <p class="eyebrow">{i18n.t("Group wagers")}</p>
      <h1 class="display-title">{i18n.t("Groups")}</h1>
      <p class="page-description">
        {i18n.t(
          "Place free-to-play wagers with people you know and see who has called it best over time.",
        )}
      </p>
    </div>
    <Button href="/groups/new" variant="secondary" class="page-heading-action">
      <Plus aria-hidden="true" size={18} />
      {i18n.t("New group")}
    </Button>
  </header>

  {#if data.groups.length === 0}
    <div class="empty-state">
      <div>
        <span class="empty-icon">
          <UsersRound aria-hidden="true" />
        </span>
        <h3 class="empty-title">{i18n.t("No groups yet")}</h3>
        <p class="empty-copy">
          {i18n.t(
            "Create a group to place wagers together and track the record.",
          )}
        </p>
        <Button href="/groups/new" class="mt-5">
          <Plus aria-hidden="true" size={18} />
          {i18n.t("New group")}
        </Button>
      </div>
    </div>
  {:else}
    <GroupList groups={data.groups} />
  {/if}
{/if}
