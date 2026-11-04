<script lang="ts">
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import UsersRound from "@lucide/svelte/icons/users-round";
  import NavigationLink from "#lib/components/fast-link/navigation-link.svelte";
  import { useTranslation } from "#lib/components/language.svelte";

  let {
    groups,
  }: {
    groups: { id: string; name: string; slug: string; role: string }[];
  } = $props();

  const i18n = useTranslation();
</script>

<div class="group-list">
  {#each groups as group (group.id)}
    <NavigationLink
      class="group-card"
      href="/groups/{group.slug}"
      preview={{ groupName: group.name }}
    >
      <span class="group-card-icon">
        <UsersRound aria-hidden="true" />
      </span>
      <span class="group-card-copy">
        <span class="group-card-name">{group.name}</span>
        <span class="fine-print">
          {group.role === "owner"
            ? i18n.t("You created this group.")
            : i18n.t("Member.")}
        </span>
      </span>
      <ChevronRight aria-hidden="true" class="group-card-chevron" />
    </NavigationLink>
  {/each}
</div>
