<script lang="ts">
  import { useTranslation } from "./language.svelte";
  import Button from "./ui/button.svelte";
  import ResetBankrollDialog from "./reset-bankroll-dialog.svelte";

  const i18n = useTranslation();
  let open = $state(false);
  let trigger = $state<HTMLButtonElement | HTMLAnchorElement | null>(null);

  function close() {
    open = false;
    trigger?.focus();
  }
</script>

<Button
  variant="danger"
  size="sm"
  aria-haspopup="dialog"
  bind:element={trigger}
  onclick={() => (open = true)}
>
  {i18n.t("Reset bankroll")}
</Button>
{#if open}
  <ResetBankrollDialog onClose={close} />
{/if}
