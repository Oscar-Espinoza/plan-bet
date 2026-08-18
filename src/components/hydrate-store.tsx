"use client";

import { useEffect } from "react";
import { useMatchdayStore } from "@/lib/store";

export function HydrateStore() {
  const hydrate = useMatchdayStore((state) => state.hydrate);
  useEffect(() => hydrate(), [hydrate]);
  return null;
}
