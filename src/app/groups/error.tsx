"use client";

import Link from "next/link";
import { RouteError } from "@/components/route-error";

export default function GroupsError({ reset }: { reset: () => void }) {
  return (
    <RouteError
      title="Groups hit an error"
      copy={
        <>
          Try again, or check your <Link href="/you">record</Link> while we sort
          it out.
        </>
      }
      reset={reset}
    />
  );
}
