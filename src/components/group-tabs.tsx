"use client";

import { useId, useState, type ReactNode } from "react";
import { useTranslation } from "@/components/language-provider";

export function GroupTabs({
  overview,
  members,
}: {
  overview: ReactNode;
  members: ReactNode;
}) {
  const { t } = useTranslation();
  const id = useId();
  const [active, setActive] = useState(0);
  return (
    <>
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
                !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
              )
                return;
              event.preventDefault();
              const next =
                event.key === "Home" ? 0 : event.key === "End" ? 1 : 1 - index;
              setActive(next);
              document.getElementById(`${id}-tab-${next}`)?.focus();
            }}
          >
            {t(label)}
          </button>
        ))}
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
