<script lang="ts">
  import { page } from "$app/state";
  import { tick } from "svelte";
  import MessageCircle from "@lucide/svelte/icons/message-circle";
  import X from "@lucide/svelte/icons/x";
  import { matchday } from "#lib/state/store.svelte";
  import { useTranslation } from "./language.svelte";
  import Button from "./ui/button.svelte";

  let { initiallyOpen = false }: { initiallyOpen?: boolean } = $props();

  type Turn = {
    role: "user" | "buddy";
    text: string;
    streaming?: boolean;
    ok?: boolean;
    factIds?: string[];
    pickId?: string;
    draft?: { groupId: string; text: string };
    /** The deterministic no-model reply: an app message, not the buddy's voice. */
    fallback?: boolean;
  };

  const RETRACTED_MESSAGE =
    "That reply didn't hold up under the grounding check, so it's been pulled. Try asking again.";
  const CONNECTION_DROPPED_MESSAGE =
    "The connection dropped. Try asking again.";
  const MAX_HISTORY_TURNS = 6;
  const MAX_QUESTION_CHARS = 500;

  /**
   * The stream as the reader should see it: every `[...]` marker is proof or
   * payload, never prose, so complete ones are cut and an unclosed one at the
   * tail is held back until it closes. The `done` frame's parsed prose replaces
   * this outright.
   */
  function visibleStream(text: string) {
    return text
      .replace(/\[[^\]]*\]/g, "")
      .replace(/\[[^\]]*$/, "")
      .replace(/\s+([,.;:!?])/g, "$1")
      .replace(/\s{2,}/g, " ");
  }

  function updateLast(turns: Turn[], patch: Partial<Turn>): Turn[] {
    if (turns.length === 0) return turns;
    const next = [...turns];
    const last = next[next.length - 1];
    if (!last) return turns;
    next[next.length - 1] = { ...last, ...patch };
    return next;
  }

  const i18n = useTranslation();
  let open = $state(initiallyOpen);
  let turns = $state<Turn[]>([]);
  let question = $state("");
  let pending = $state(false);
  let forgetting = $state(false);
  let forgotten = $state(false);
  let dialog = $state<HTMLDialogElement | null>(null);
  let launcher = $state<HTMLButtonElement | HTMLAnchorElement | null>(null);
  let inFlight = false;

  const pathname = $derived(page.url.pathname);
  const gameMatch = $derived(pathname.match(/^\/games\/([^/?#]+)\/?$/));
  const routeId = $derived(gameMatch?.[1]);

  $effect(() => {
    if (!open) return;
    const node = dialog;
    if (!node) return;
    let active = true;
    void tick().then(() => {
      if (!active || !node.isConnected) return;
      if (!node.open) node.showModal();
      node.querySelector<HTMLElement>("#buddy-question")?.focus();
    });
    return () => {
      active = false;
    };
  });

  function finishClose() {
    open = false;
    launcher?.focus();
  }

  function closePanel() {
    if (dialog?.open) dialog.close();
    else finishClose();
  }

  async function ask(event: SubmitEvent) {
    event.preventDefault();
    const text = question.trim();
    if (!text || inFlight) return;
    inFlight = true;
    pending = true;
    question = "";

    const history = turns
      .filter(
        (turn) => turn.role === "user" || (turn.ok === true && !turn.fallback),
      )
      .slice(-MAX_HISTORY_TURNS)
      .map((turn) => ({
        role: turn.role,
        text: turn.text,
      }));
    turns = [
      ...turns,
      { role: "user", text },
      { role: "buddy", text: "", streaming: true },
    ];

    try {
      const response = await fetch("/api/buddy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversation: matchday.buddyConversation,
          sessionId: matchday.anonymousId,
          route: pathname,
          question: text,
          history,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });

      if (!response.ok || !response.body) {
        const payload: unknown = await response.json().catch(() => null);
        const message =
          payload &&
          typeof payload === "object" &&
          "error" in payload &&
          typeof (payload as { error?: { message?: unknown } }).error
            ?.message === "string"
            ? (payload as { error: { message: string } }).error.message
            : "The buddy didn't respond. Try again.";
        turns = updateLast(turns, {
          text: message,
          streaming: false,
          ok: false,
        });
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let accumulated = "";
      let finalized = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";
        for (const frame of frames) {
          const line = frame
            .split("\n")
            .find((item) => item.startsWith("data:"));
          if (!line) continue;
          let payload: {
            type: string;
            text?: string;
            ok?: boolean;
            prose?: string;
            factIds?: string[];
            pickId?: string;
            draft?: { groupId: string; text: string };
            reason?: string;
          };
          try {
            payload = JSON.parse(line.slice(5).trim());
          } catch {
            continue;
          }
          if (payload.type === "delta" && payload.text) {
            accumulated += payload.text;
            const shown = visibleStream(accumulated);
            turns = updateLast(turns, { text: shown });
          } else if (payload.type === "done") {
            finalized = true;
            const prose = payload.prose;
            turns = updateLast(
              turns,
              payload.ok === true && typeof prose === "string" && prose
                ? {
                    text: prose,
                    streaming: false,
                    ok: true,
                    factIds: payload.factIds,
                    pickId: payload.pickId,
                    draft: payload.draft,
                    fallback: Boolean(payload.reason),
                  }
                : { text: RETRACTED_MESSAGE, streaming: false, ok: false },
            );
          }
        }
      }
      if (!finalized) {
        turns = updateLast(turns, {
          text: CONNECTION_DROPPED_MESSAGE,
          streaming: false,
          ok: false,
        });
      }
    } catch {
      turns = updateLast(turns, {
        text: CONNECTION_DROPPED_MESSAGE,
        streaming: false,
        ok: false,
      });
    } finally {
      inFlight = false;
      pending = false;
    }
  }

  async function forget() {
    forgetting = true;
    try {
      await fetch("/api/buddy", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: matchday.anonymousId }),
      });
      forgotten = true;
    } catch {
      // Quiet control — a failed clear just leaves the notes in place.
    } finally {
      forgetting = false;
    }
  }
</script>

<Button
  variant="secondary"
  size="sm"
  class="buddy-launcher"
  bind:element={launcher}
  onclick={() => (open ? closePanel() : (open = true))}
>
  <MessageCircle aria-hidden="true" size={15} />
  {i18n.t("Buddy")}
</Button>

{#if open}
  <dialog
    class="buddy-panel"
    bind:this={dialog}
    aria-labelledby="buddy-title"
    onclose={finishClose}
  >
    <div class="buddy-panel-header">
      <h2 class="buddy-panel-title" id="buddy-title">{i18n.t("Buddy")}</h2>
      <Button
        variant="ghost"
        size="icon"
        aria-label={i18n.t("Close")}
        onclick={closePanel}
      >
        <X aria-hidden="true" size={16} />
      </Button>
    </div>
    <p class="fine-print">
      {i18n.t(
        "Casual takes on fictional credits, grounded in what’s on this page. Never advice about real-money wagering.",
      )}
    </p>
    <div class="buddy-transcript" aria-live="polite">
      {#if turns.length === 0}
        <p class="fine-print">
          {i18n.t(
            "Ask what it makes of this page — a game, your record, or a group’s board.",
          )}
        </p>
      {/if}
      {#each turns as turn, index (index)}
        <div class="buddy-turn">
          <span class="eyebrow">
            {turn.role === "user" ? i18n.t("You") : i18n.t("Buddy")}
          </span>
          <p
            class={turn.streaming
              ? "buddy-turn-text buddy-turn-streaming"
              : "buddy-turn-text"}
          >
            {turn.role === "buddy" && turn.ok === false
              ? i18n.t(turn.text)
              : turn.text}
          </p>
          {#if turn.ok && turn.pickId && routeId}
            <Button
              variant="secondary"
              size="sm"
              href={`/games/${routeId}?pick=${encodeURIComponent(turn.pickId)}`}
              onclick={closePanel}
            >
              {i18n.t("Back this")}
            </Button>
          {/if}
          {#if turn.ok && turn.draft}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onclick={() => {
                const draft = turn.draft;
                if (!draft) return;
                matchday.draftComment(draft.groupId, draft.text);
                closePanel();
              }}
            >
              {i18n.t("Use as my comment")}
            </Button>
          {/if}
        </div>
      {/each}
    </div>
    <form class="buddy-form" onsubmit={ask}>
      <label for="buddy-question" class="sr-only">
        {i18n.t("Ask the buddy")}
      </label>
      <input
        id="buddy-question"
        class="field"
        bind:value={question}
        maxlength={MAX_QUESTION_CHARS}
        placeholder={i18n.t("What do you make of this one?")}
        disabled={pending}
      />
      <Button type="submit" size="sm" disabled={pending || !question.trim()}>
        {i18n.t("Ask")}
      </Button>
    </form>
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={forgetting}
      onclick={forget}
    >
      {forgotten
        ? i18n.t("Forgotten")
        : i18n.t("Forget what you know about me")}
    </Button>
  </dialog>
{/if}
