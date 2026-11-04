"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslation } from "@/components/language-provider";
import type { Message } from "@/lib/locale";

type Panel = { key: string; label: Message; content: ReactNode };

/**
 * Tabs over content the server already rendered: every panel arrives with
 * the page, so switching is instant and never refetches. The active tab is
 * mirrored into `?tab=` (replaceState, no navigation) so a refresh, a shared
 * link or a form on one tab lands back on that tab; a panel's own links and
 * forms still navigate as usual.
 */
export function SectionTabs({
  panels,
  label,
  initial,
}: {
  panels: Panel[];
  label: Message;
  initial: string;
}) {
  const { t } = useTranslation();
  const id = useId();
  const param = useSearchParams()?.get("tab");
  const keys = panels.map((panel) => panel.key);
  const [active, setActive] = useState(
    keys.includes(initial) ? initial : keys[0]!,
  );
  // A back/forward step changes the param without re-mounting the page.
  const [seenParam, setSeenParam] = useState(param);
  if (param !== seenParam) {
    setSeenParam(param);
    if (param && keys.includes(param)) setActive(param);
  }
  const firstKey = keys[0]!;
  useEffect(() => {
    const url = new URL(window.location.href);
    if ((url.searchParams.get("tab") ?? firstKey) === active) return;
    if (active === firstKey) url.searchParams.delete("tab");
    else url.searchParams.set("tab", active);
    window.history.replaceState(window.history.state, "", url);
  }, [active, firstKey]);

  return (
    <>
      <div className="section-tabs" role="tablist" aria-label={t(label)}>
        {panels.map((panel, index) => (
          <button
            type="button"
            role="tab"
            key={panel.key}
            id={`${id}-tab-${panel.key}`}
            aria-controls={`${id}-panel-${panel.key}`}
            aria-selected={active === panel.key}
            tabIndex={active === panel.key ? 0 : -1}
            onClick={() => setActive(panel.key)}
            onKeyDown={(event) => {
              const moves: Record<string, number> = {
                ArrowLeft: index - 1,
                ArrowRight: index + 1,
                Home: 0,
                End: panels.length - 1,
              };
              const next = moves[event.key];
              if (next === undefined) return;
              event.preventDefault();
              const target = panels[(next + panels.length) % panels.length]!;
              setActive(target.key);
              document.getElementById(`${id}-tab-${target.key}`)?.focus();
            }}
          >
            {t(panel.label)}
          </button>
        ))}
      </div>
      {panels.map((panel) => (
        <div
          key={panel.key}
          role="tabpanel"
          id={`${id}-panel-${panel.key}`}
          aria-labelledby={`${id}-tab-${panel.key}`}
          hidden={active !== panel.key}
          tabIndex={0}
        >
          {panel.content}
        </div>
      ))}
    </>
  );
}
