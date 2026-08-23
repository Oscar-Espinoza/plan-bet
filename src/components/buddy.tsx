"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { MessageCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MAX_QUESTION_CHARS } from "@/lib/buddy-prompt";
import { useMatchdayStore } from "@/lib/store";
import { cn } from "@/lib/utils";

type Turn = {
  role: "user" | "buddy";
  text: string;
  streaming?: boolean;
  ok?: boolean;
  factIds?: string[];
  pickId?: string;
};

const RETRACTED_MESSAGE =
  "That reply didn't hold up under the grounding check, so it's been pulled. Try asking again.";
const MAX_HISTORY_TURNS = 6;

function updateLast(turns: Turn[], patch: Partial<Turn>): Turn[] {
  if (turns.length === 0) return turns;
  const next = [...turns];
  next[next.length - 1] = { ...next[next.length - 1]!, ...patch };
  return next;
}

export function Buddy() {
  const pathname = usePathname();
  const hydrated = useMatchdayStore((state) => state.hydrated);
  const anonymousId = useMatchdayStore((state) => state.anonymousId);
  const conversation = useMatchdayStore((state) => state.buddyConversation);
  const tourStep = useMatchdayStore((state) => state.tourStep);

  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState("");
  const [pending, setPending] = useState(false);
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

    const history = turns.slice(-MAX_HISTORY_TURNS).map((turn) => ({
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
          };
          try {
            payload = JSON.parse(line.slice(5).trim());
          } catch {
            continue;
          }
          if (payload.type === "delta" && payload.text) {
            accumulated += payload.text;
            setTurns((current) => updateLast(current, { text: accumulated }));
          } else if (payload.type === "done") {
            setTurns((current) =>
              updateLast(
                current,
                payload.ok
                  ? {
                      text: payload.prose,
                      streaming: false,
                      ok: true,
                      factIds: payload.factIds,
                      pickId: payload.pickId,
                    }
                  : { text: RETRACTED_MESSAGE, streaming: false, ok: false },
              ),
            );
          }
        }
      }
    } catch {
      setTurns((current) =>
        updateLast(current, {
          text: "The connection dropped. Try asking again.",
          streaming: false,
          ok: false,
        }),
      );
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button
          variant="secondary"
          size="sm"
          className={cn(
            "buddy-launcher",
            tourStep < 4 && "buddy-launcher-raised",
          )}
        >
          <MessageCircle aria-hidden="true" size={15} />
          Buddy
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="buddy-overlay" />
        <Dialog.Content className="buddy-panel">
          <div className="buddy-panel-header">
            <Dialog.Title className="buddy-panel-title">Buddy</Dialog.Title>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Close">
                <X aria-hidden="true" size={16} />
              </Button>
            </Dialog.Close>
          </div>
          <Dialog.Description className="fine-print">
            Casual takes on fictional credits, grounded in what&rsquo;s on this
            page. Never advice about real-money wagering.
          </Dialog.Description>
          <div className="buddy-transcript" aria-live="polite">
            {turns.length === 0 && (
              <p className="fine-print">
                Ask what it makes of this page — a game, your record, or a
                group&rsquo;s board.
              </p>
            )}
            {turns.map((turn, index) => (
              <div className="buddy-turn" key={index}>
                <span className="eyebrow">
                  {turn.role === "user" ? "You" : "Buddy"}
                </span>
                <p
                  className={
                    turn.streaming
                      ? "buddy-turn-text buddy-turn-streaming"
                      : "buddy-turn-text"
                  }
                >
                  {turn.text}
                </p>
                {turn.ok && turn.pickId && routeId && (
                  <Link
                    href={`/games/${routeId}?pick=${encodeURIComponent(turn.pickId)}`}
                    onClick={() => setOpen(false)}
                  >
                    <Button variant="secondary" size="sm">
                      Back this
                    </Button>
                  </Link>
                )}
              </div>
            ))}
          </div>
          <form className="buddy-form" onSubmit={ask}>
            <label htmlFor="buddy-question" className="sr-only">
              Ask the buddy
            </label>
            <input
              id="buddy-question"
              className="field"
              value={question}
              maxLength={MAX_QUESTION_CHARS}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="What do you make of this one?"
              disabled={pending}
            />
            <Button
              type="submit"
              size="sm"
              disabled={pending || !question.trim()}
            >
              Ask
            </Button>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
