"use client";

import { useState } from "react";

/** Decorative beside the full team name; unavailable crests leave no broken image. */
export function TeamLogo({ src }: { src?: string }) {
  const [failedSrc, setFailedSrc] = useState<string>();
  if (!src || src === failedSrc) return null;
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
