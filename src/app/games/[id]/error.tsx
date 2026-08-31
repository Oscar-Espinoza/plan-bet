"use client";

import Link from "next/link";

export default function GameError({ reset }: { reset: () => void }) {
  return (
    <div className="mp">
      <div className="mp-empty">
        <p className="mp-empty-eyebrow">Games board</p>
        <h1 className="mp-empty-title">This game hit an error</h1>
        <p className="mp-empty-copy">
          Try again, or check the <Link href="/">games board</Link> for what
          else is on.
        </p>
        <button type="button" className="button" onClick={reset}>
          Try again
        </button>
      </div>
    </div>
  );
}
