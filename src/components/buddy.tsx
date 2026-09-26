"use client";
import { useTranslation } from "@/components/language-provider";

import { useRef, useState } from "react";
import { NavigationLink as Link } from "@/components/fast-link";
import { usePathname } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { MessageCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MAX_QUESTION_CHARS } from "@/lib/buddy-prompt";
import { useMatchdayStore } from "@/lib/store";

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
const CONNECTION_DROPPED_MESSAGE = "The connection dropped. Try asking again.";
const MAX_HISTORY_TURNS = 6;

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
  next[next.length - 1] = { ...next[next.length - 1]!, ...patch };
  return next;
}

export function Buddy({ initiallyOpen = false }: { initiallyOpen?: boolean }) {
  const { t } = useTranslation();
  const pathname = usePathname();
  const hydrated = useMatchdayStore((state) => state.hydrated);
  const anonymousId = useMatchdayStore((state) => state.anonymousId);
  const conversation = useMatchdayStore((state) => state.buddyConversation);
  const draftComment = useMatchdayStore((state) => state.draftComment);

  const [open, setOpen] = useState(initiallyOpen);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState("");
  const [pending, setPending] = useState(false);
  const [forgetting, setForgetting] = useState(false);
  const [forgotten, setForgotten] = useState(false);
  const inFlight = useRef(false);

  const gameMatch = pathname.match(/^\/games\/([^/?#]+)\/?$/);
  const routeId = gameMatch?.[1];

  if (!hydrated) return null;

  const ask = async (event: React.FormEvent) => {
    event.preventDefault();
    const text = question.trim();
    if (!text || inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setQuestion("");

    // Only a buddy turn the server finalized as grounded goes back as history.
    // A retracted, failed, unfinished or fallback reply is an app message, not
    // something the buddy said — sending it back would have the model read its
    // own error text (and a fallback's fact dump can overrun the turn cap).
    const history = turns
      .filter(
        (turn) => turn.role === "user" || (turn.ok === true && !turn.fallback),
      )
      .slice(-MAX_HISTORY_TURNS)
      .map((turn) => ({
        role: turn.role,
        text: turn.text,
      }));
    setTurns((current) => [
      ...current,
      { role: "user", text },
      { role: "buddy", text: "", streaming: true },
    ]);

    try {
      const response = await fetch("/api/buddy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversation,
          sessionId: anonymousId,
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
        setTurns((current) =>
          updateLast(current, { text: message, streaming: false, ok: false }),
        );
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
          const line = frame.split("\n").find((l) => l.startsWith("data:"));
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
            setTurns((current) => updateLast(current, { text: shown }));
          } else if (payload.type === "done") {
            finalized = true;
            const prose = payload.prose;
            setTurns((current) =>
              updateLast(
                current,
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
              ),
            );
          }
        }
      }
      // The stream closed without a grounding verdict: whatever streamed is
      // unvalidated, so it's pulled rather than left standing.
      if (!finalized) {
        setTurns((current) =>
          updateLast(current, {
            text: CONNECTION_DROPPED_MESSAGE,
            streaming: false,
            ok: false,
          }),
        );
      }
    } catch {
      setTurns((current) =>
        updateLast(current, {
          text: CONNECTION_DROPPED_MESSAGE,
          streaming: false,
          ok: false,
        }),
      );
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  };

  const forget = async () => {
    setForgetting(true);
    try {
      await fetch("/api/buddy", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: anonymousId }),
      });
      setForgotten(true);
    } catch {
      // Quiet control — a failed clear just leaves the notes in place.
    } finally {
      setForgetting(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button variant="secondary" size="sm" className="buddy-launcher">
          <MessageCircle aria-hidden="true" size={15} />
          {t("Buddy")}{" "}
        </Button>
      </Dialog.Trigger>
      <Dialog.Overlay className="buddy-overlay" />
      <Dialog.Content className="buddy-panel">
        <div className="buddy-panel-header">
          <Dialog.Title className="buddy-panel-title">
            {t("Buddy")}
          </Dialog.Title>
          <Dialog.Close asChild>
            <Button variant="ghost" size="icon" aria-label={t("Close")}>
              <X aria-hidden="true" size={16} />
            </Button>
          </Dialog.Close>
        </div>
        <Dialog.Description className="fine-print">
          {t(
            "Casual takes on fictional credits, grounded in what’s on this page. Never advice about real-money wagering.",
          )}{" "}
        </Dialog.Description>
        <div className="buddy-transcript" aria-live="polite">
          {turns.length === 0 && (
            <p className="fine-print">
              {t(
                "Ask what it makes of this page — a game, your record, or a group’s board.",
              )}{" "}
            </p>
          )}
          {turns.map((turn, index) => (
            <div className="buddy-turn" key={index}>
              <span className="eyebrow">
                {turn.role === "user" ? t("You") : t("Buddy")}
              </span>
              <p
                className={
                  turn.streaming
                    ? "buddy-turn-text buddy-turn-streaming"
                    : "buddy-turn-text"
                }
              >
                {turn.role === "buddy" && turn.ok === false
                  ? t(turn.text)
                  : turn.text}
              </p>
              {turn.ok && turn.pickId && routeId && (
                <Link
                  href={`/games/${routeId}?pick=${encodeURIComponent(turn.pickId)}`}
                  onClick={() => setOpen(false)}
                >
                  <Button variant="secondary" size="sm">
                    {t("Back this")}{" "}
                  </Button>
                </Link>
              )}
              {turn.ok && turn.draft && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    draftComment(turn.draft!.groupId, turn.draft!.text);
                    setOpen(false);
                  }}
                >
                  {t("Use as my comment")}{" "}
                </Button>
              )}
            </div>
          ))}
        </div>
        <form className="buddy-form" onSubmit={ask}>
          <label htmlFor="buddy-question" className="sr-only">
            {t("Ask the buddy")}{" "}
          </label>
          <input
            id="buddy-question"
            className="field"
            value={question}
            maxLength={MAX_QUESTION_CHARS}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder={t("What do you make of this one?")}
            disabled={pending}
          />
          <Button
            type="submit"
            size="sm"
            disabled={pending || !question.trim()}
          >
            {t("Ask")}{" "}
          </Button>
        </form>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={forgetting}
          onClick={forget}
        >
          {forgotten ? t("Forgotten") : t("Forget what you know about me")}
        </Button>
      </Dialog.Content>
    </Dialog.Root>
  );
}
