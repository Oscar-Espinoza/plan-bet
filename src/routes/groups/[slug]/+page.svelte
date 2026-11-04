<script lang="ts">
  import UserPlus from "@lucide/svelte/icons/user-plus";
  import Users from "@lucide/svelte/icons/users";
  import Breadcrumb from "#lib/components/breadcrumb.svelte";
  import GroupActivity from "#lib/components/group-activity.svelte";
  import GroupTabs from "#lib/components/group-tabs.svelte";
  import InviteMemberForm from "#lib/components/invite-member-form.svelte";
  import JoinLink from "#lib/components/join-link.svelte";
  import { useTranslation } from "#lib/components/language.svelte";
  import NotifyToggle from "#lib/components/notify-toggle.svelte";
  import RevokeInviteButton from "#lib/components/revoke-invite-button.svelte";
  import Button from "#lib/components/ui/button.svelte";
  import Card from "#lib/components/ui/card.svelte";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();
  const i18n = useTranslation();
  const memberWord = $derived(
    data.memberCount === 1 ? i18n.t("member") : i18n.t("members"),
  );
  const memberNames = $derived(
    data.members.map((member) => ({
      userId: member.userId,
      name: member.name ?? member.email,
    })),
  );
</script>

<svelte:head>
  <title>{data.title}</title>
</svelte:head>

<div class="group-detail">
  <header class="page-heading">
    <Breadcrumb
      items={[
        { label: i18n.t("Groups"), href: "/groups" },
        { label: data.name },
      ]}
    />
    <div>
      <p class="eyebrow">{i18n.t("Group wagers")}</p>
      <h1 class="display-title">{data.name}</h1>
      <p class="page-description">
        {data.memberCount}
        {memberWord}
      </p>
    </div>
  </header>

  <GroupTabs>
    {#snippet action()}
      <Button
        href="/groups/{data.slug}?tab=members#invite"
        variant="secondary"
        class="group-tabs-action"
      >
        <UserPlus aria-hidden="true" size={16} />
        {i18n.t("Invite")}
      </Button>
    {/snippet}
    {#snippet overview()}
      <div class="group-overview">
        <GroupActivity
          entries={data.leaderboard}
          fixtures={data.upcoming}
          matches={data.recentActivity}
          members={memberNames}
          viewerId={data.viewerId}
        />
      </div>
    {/snippet}
    {#snippet members()}
      <Card titleId="members-heading">
        {#snippet title()}{i18n.t("Members")}{/snippet}
        {#snippet headerExtra()}
          <span class="fine-print inline-flex items-center gap-1.5">
            <Users aria-hidden="true" size={13} />
            {data.memberCount}
            {memberWord}
          </span>
        {/snippet}
        {#each data.members as member (member.userId)}
          <div class="stat-row">
            <span>{member.name ?? member.email ?? i18n.t("Member")}</span>
            <span class="fine-print">{i18n.t(member.role)}</span>
          </div>
        {/each}
        <div class="form-block">
          <NotifyToggle slug={data.slug} enabled={data.notifyOnActivity} />
        </div>
        <div class="form-block" id="invite">
          <JoinLink slug={data.slug} />
        </div>
        <div class="form-block">
          <InviteMemberForm slug={data.slug} />
        </div>
        {#if data.pendingEmailInvites.length > 0}
          <div class="form-block">
            <span class="field-label">{i18n.t("Outstanding invites")}</span>
            {#each data.pendingEmailInvites as invite (invite.id)}
              <div class="stat-row">
                <span>{invite.email}</span>
                <RevokeInviteButton slug={data.slug} inviteId={invite.id} />
              </div>
            {/each}
          </div>
        {/if}
      </Card>
    {/snippet}
  </GroupTabs>
</div>
