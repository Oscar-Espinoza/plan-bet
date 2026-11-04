"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslation } from "@/components/language-provider";

export function GroupTabs({
  overview,
  members,
  action,
}: {
  overview: ReactNode;
  members: ReactNode;
  /** Sits at the end of the tab row, e.g. the "Invite" link. */
  action?: ReactNode;
}) {
  const { t } = useTranslation();
  const id = useId();
  // ?tab=members opens the members tab, which is where "Invite" points.
  const tab = useSearchParams()?.get("tab");
  const [active, setActive] = useState(tab === "members" ? 1 : 0);
  const [seenTab, setSeenTab] = useState(tab);
  if (tab !== seenTab) {
    setSeenTab(tab);
    if (tab === "members") setActive(1);
  }
  useEffect(() => {
    if (tab === "members")
      document.getElementById("invite")?.scrollIntoView({ block: "start" });
  }, [tab]);
  return (
    <>
      <div className="group-tabs-bar">
        <div
          className="group-tabs"
          role="tablist"
          aria-label={t("Group sections")}
        >
          {["Overview", "Members"].map((label, index) => (
            <button
              type="button"
              role="tab"
              key={label}
              id={`${id}-tab-${index}`}
              aria-controls={`${id}-panel-${index}`}
              aria-selected={active === index}
              tabIndex={active === index ? 0 : -1}
              onClick={() => setActive(index)}
              onKeyDown={(event) => {
                if (
                  !["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                    event.key,
                  )
                )
                  return;
                event.preventDefault();
                const next =
                  event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? 1
                      : 1 - index;
                setActive(next);
                document.getElementById(`${id}-tab-${next}`)?.focus();
              }}
            >
              {t(label)}
            </button>
          ))}
        </div>
        {action}
      </div>
      {[overview, members].map((content, index) => (
        <div
          key={index}
          role="tabpanel"
          id={`${id}-panel-${index}`}
          aria-labelledby={`${id}-tab-${index}`}
          hidden={active !== index}
          tabIndex={0}
        >
          {content}
        </div>
      ))}
    </>
  );
}
