"use client";

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

// The app shell's phone topbar reserves this slot (see .topbar-crumb).
export const CRUMB_SLOT_ID = "topbar-crumb";

const subscribe = () => () => {};

// The breadcrumb renders in the page for desktop and, once hydrated, again in
// the topbar slot for phones; CSS shows exactly one copy per width. The slot
// is empty on the server and first client render, so there is no hydration
// mismatch, and it is always reserved, so filling it moves nothing.
export function BreadcrumbPortal({ children }: { children: React.ReactNode }) {
  const slot = useSyncExternalStore(
    subscribe,
    () => document.getElementById(CRUMB_SLOT_ID),
    () => null,
  );
  return (
    <>
      {children}
      {slot && createPortal(children, slot)}
    </>
  );
}
