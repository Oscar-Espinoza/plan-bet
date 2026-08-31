/**
 * Exists only to load the matchup stylesheet for every file in this segment —
 * the page, its loading and not-found states, and its error boundary — so
 * none of them can render in the new markup without the new language.
 */
import "./matchup.css";

export default function GameLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
