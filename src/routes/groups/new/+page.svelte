<script lang="ts">
  import Breadcrumb from "#lib/components/breadcrumb.svelte";
  import CreateGroupForm from "#lib/components/create-group-form.svelte";
  import { useTranslation } from "#lib/components/language.svelte";
  import Card from "#lib/components/ui/card.svelte";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();
  const i18n = useTranslation();
</script>

<svelte:head>
  <title>{data.title}</title>
</svelte:head>

<header class="page-heading">
  <Breadcrumb
    items={[
      { label: i18n.t("Groups"), href: "/groups" },
      { label: i18n.t("New group") },
    ]}
  />
  <div>
    <p class="eyebrow">{i18n.t("Group wagers")}</p>
    <h1 class="display-title">{i18n.t("New group")}</h1>
  </div>
</header>

<Card titleId="new-group-heading">
  {#snippet title()}{i18n.t("Create a group")}{/snippet}
  <CreateGroupForm />
</Card>
