<script lang="ts">
  import { refreshAll } from "$app/navigation";
  import { onDestroy, tick } from "svelte";
  import { accountChip } from "#lib/state/account-chip.svelte";
  import { afterExit, DURATION } from "#lib/components/motion";
  import { useTranslation } from "./language.svelte";
  import Banner from "./ui/banner.svelte";
  import Button from "./ui/button.svelte";

  let { onClose }: { onClose: () => void } = $props();

  const i18n = useTranslation();
  let dialog = $state<HTMLDialogElement | null>(null);
  let pending = $state(false);
  let error = $state<string | null>(null);
  let attempt = $state(0);
  let closing = $state(false);
  let cancelExit: (() => void) | null = null;

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

  onDestroy(() => {
    cancelExit?.();
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
    if (pending || closing) return;
    closing = true;
    cancelExit = afterExit(DURATION.swap, () => dialog?.close());
  }

  function onCancel(event: Event) {
    if (pending) {
      event.preventDefault();
      return;
    }
    if (event.cancelable) {
      event.preventDefault();
      requestClose();
    }
  }

  async function handleReset() {
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
      attempt += 1;
      return;
    }
    const payload: unknown = await response.json().catch(() => null);
    const balance = readBalance(payload);
    if (balance === null) {
      error = "The reset did not go through. Try again.";
      attempt += 1;
      return;
    }
    error = null;
    accountChip.setBalance(balance);
    requestClose();
    void refreshAll();
  }

  function handleClose() {
    cancelExit?.();
    cancelExit = null;
    closing = false;
    onClose();
  }
</script>

<dialog
  class="alert-content"
  bind:this={dialog}
  tabindex="-1"
  data-closing={closing || undefined}
  aria-labelledby="reset-bankroll-title"
  aria-describedby="reset-bankroll-copy"
  oncancel={onCancel}
  onclose={handleClose}
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
    {#key attempt}
      <Banner class="enter" tone="negative" role="alert">{i18n.t(error)}</Banner
      >
    {/key}
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
      <span class="label-swap">
        <span aria-hidden={pending}>{i18n.t("Reset bankroll")}</span>
        <span aria-hidden={!pending}>{i18n.t("Resetting…")}</span>
      </span>
    </Button>
  </div>
</dialog>
