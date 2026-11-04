<script lang="ts">
  import { refreshAll } from "$app/navigation";
  import { tick } from "svelte";
  import { accountChip } from "#lib/state/account-chip.svelte";
  import { useTranslation } from "./language.svelte";
  import Banner from "./ui/banner.svelte";
  import Button from "./ui/button.svelte";

  let { onClose }: { onClose: () => void } = $props();

  const i18n = useTranslation();
  let dialog = $state<HTMLDialogElement | null>(null);
  let pending = $state(false);
  let error = $state<string | null>(null);

  $effect(() => {
    const node = dialog;
    if (!node) return;
    let active = true;
    void tick().then(() => {
      if (!active || !node) return;
      if (!node.open) node.showModal();
      node.focus();
    });
    return () => {
      active = false;
    };
  });

  function readBalance(payload: unknown) {
    if (!payload || typeof payload !== "object" || !("data" in payload))
      return null;
    const data = payload.data;
    if (!data || typeof data !== "object" || !("balance" in data)) return null;
    const balance = data.balance;
    return typeof balance === "number" ? balance : null;
  }

  function requestClose() {
    if (pending) return;
    dialog?.close();
  }

  function onCancel(event: Event) {
    if (pending) event.preventDefault();
  }

  async function handleReset() {
    error = null;
    pending = true;
    const response = await fetch("/api/bets/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    }).catch(() => null);
    pending = false;
    if (!response?.ok) {
      error =
        response?.status === 429
          ? "Reset limit reached. Try again later."
          : "The reset did not go through. Try again.";
      return;
    }
    const payload: unknown = await response.json().catch(() => null);
    const balance = readBalance(payload);
    if (balance === null) {
      error = "The reset did not go through. Try again.";
      return;
    }
    accountChip.setBalance(balance);
    dialog?.close();
    void refreshAll();
  }
</script>

<dialog
  class="alert-content"
  bind:this={dialog}
  tabindex="-1"
  aria-labelledby="reset-bankroll-title"
  aria-describedby="reset-bankroll-copy"
  oncancel={onCancel}
  onclose={() => onClose()}
>
  <h2 class="alert-title" id="reset-bankroll-title">
    {i18n.t("Reset your bankroll?")}
  </h2>
  <p class="alert-description" id="reset-bankroll-copy">
    {i18n.t(
      "This returns your credit balance to the starting amount. It does not affect any wagers already placed.",
    )}
  </p>
  {#if error}
    <Banner tone="negative" role="alert">{i18n.t(error)}</Banner>
  {/if}
  <div class="alert-actions">
    <Button variant="secondary" disabled={pending} onclick={requestClose}>
      {i18n.t("Cancel")}
    </Button>
    <Button
      variant="danger"
      disabled={pending}
      onclick={() => void handleReset()}
    >
      {i18n.t(pending ? "Resetting…" : "Reset bankroll")}
    </Button>
  </div>
</dialog>
