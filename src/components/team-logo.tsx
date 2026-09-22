"use client";

import { useState } from "react";

/** Decorative beside the full team name; unavailable crests leave no broken image. */
export function TeamLogo({ src }: { src?: string }) {
  const [failedSrc, setFailedSrc] = useState<string>();
  if (!src || src === failedSrc) {
    return (
      <span className="team-logo" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M12 3 4 6v6c0 4 4 7 8 9 4-2 8-5 8-9V6Z" />
          <path d="M9 12h6" />
        </svg>
      </span>
    );
  }
  return (
    <span className="team-logo" aria-hidden="true">
      {/* Native SVG images need no image optimizer or remote proxy. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        width={64}
        height={64}
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setFailedSrc(src)}
      />
    </span>
  );
}
