import type { Sport } from "@/lib/contracts";

/**
 * The playing surface, drawn as line work behind a hero.
 *
 * Flat vector, no network, no photography — the app has none and inventing a
 * stadium photo would be inventing content. Two shapes, one per sport, so the
 * discriminated union stays exhaustive: adding a sport fails the build here
 * rather than rendering nothing.
 *
 * Purely decorative: `aria-hidden`, and every surface that renders it puts a
 * scrim between the art and the type, so contrast never depends on it.
 */
export function PitchArt({ sport }: { sport: Sport }) {
  return (
    <span className="pitch-art" aria-hidden="true">
      {sport === "soccer" ? <Pitch /> : <Diamond />}
    </span>
  );
}

function Pitch() {
  return (
    <svg viewBox="0 0 390 200" preserveAspectRatio="xMidYMid meet">
      <rect x="18" y="10" width="354" height="180" />
      <line x1="195" y1="10" x2="195" y2="190" />
      <circle cx="195" cy="100" r="40" />
      <circle className="pitch-art-spot" cx="195" cy="100" r="3" />
      <rect x="18" y="52" width="56" height="96" />
      <rect x="18" y="78" width="22" height="44" />
      <rect x="316" y="52" width="56" height="96" />
      <rect x="350" y="78" width="22" height="44" />
    </svg>
  );
}

function Diamond() {
  return (
    <svg viewBox="0 0 390 200" preserveAspectRatio="xMidYMid meet">
      <path d="M195 186 L96 96 L195 6 L294 96 Z" />
      <path d="M195 186 L141 134 L195 82 L249 134 Z" />
      <circle cx="195" cy="134" r="17" />
      <path d="M40 186 A 190 190 0 0 1 350 186" />
      <rect className="pitch-art-spot" x="189" y="180" width="12" height="12" />
      <rect className="pitch-art-spot" x="135" y="128" width="11" height="11" />
      <rect className="pitch-art-spot" x="244" y="128" width="11" height="11" />
    </svg>
  );
}
