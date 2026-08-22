"use client";

import Link from "next/link";
import { RouteError } from "@/components/route-error";

export default function GameError({ reset }: { reset: () => void }) {
  return (
    <RouteError
      title="This game hit an error"
      copy={
        <>
          Try again, or check the <Link href="/">games board</Link> for what
          else is on.
        </>
      }
      reset={reset}
    />
  );
}
