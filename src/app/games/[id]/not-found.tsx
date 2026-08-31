import Link from "next/link";

export default function GameNotFound() {
  return (
    <div className="mp">
      <div className="mp-empty">
        <p className="mp-empty-eyebrow">Games board</p>
        <h1 className="mp-empty-title">Game not found</h1>
        <p className="mp-empty-copy">
          This matchup is not on the current slate. Every upcoming fixture is on
          the games board.
        </p>
        <Link className="button" href="/">
          Back to the games board
        </Link>
      </div>
    </div>
  );
}
