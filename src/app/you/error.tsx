"use client";

import Link from "next/link";
import { RouteError } from "@/components/route-error";

export default function YouError({ reset }: { reset: () => void }) {
  return (
    <RouteError
      title="Your record hit an error"
      copy={
        <>
          Try again, or place your next wager from the{" "}
          <Link href="/">games board</Link> while we sort it out.
        </>
      }
      reset={reset}
    />
  );
}
