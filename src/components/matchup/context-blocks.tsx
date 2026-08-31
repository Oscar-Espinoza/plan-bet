import type { ContextBlock, StatRow } from "@/lib/game-view";

/** W / D / L as toned letters — read at a glance, not parsed word by word. */
function Form({ value }: { value: string }) {
  return (
    <span className="mp-form">
      {value.split("").map((letter, index) => (
        <b key={`${letter}-${index}`} data-result={letter}>
          {letter}
        </b>
      ))}
    </span>
  );
}

function Value({ row, text }: { row: StatRow; text: string }) {
  return row.format === "form" ? (
    <Form value={text} />
  ) : (
    <span data-mono={row.format === "mono" || undefined}>{text}</span>
  );
}

function Row({ row, compare }: { row: StatRow; compare: boolean }) {
  // A comparison and a statement are different rows, not one row with holes:
  // the comparison holds its two columns even when one side has no value, so
  // the numbers under it stay in line down the block.
  if (compare && (row.home !== undefined || row.away !== undefined)) {
    return (
      <div className="mp-row mp-row-vs">
        <span className="mp-row-label">{row.label}</span>
        <span className="mp-row-home">
          {row.home && <Value row={row} text={row.home} />}
        </span>
        <span className="mp-row-away">
          {row.away && <Value row={row} text={row.away} />}
        </span>
      </div>
    );
  }
  const stated = row.value ?? row.home ?? row.away;
  return (
    <div className="mp-row">
      {row.label && <span className="mp-row-label">{row.label}</span>}
      {stated && (
        <span className="mp-row-value">
          <Value row={row} text={stated} />
        </span>
      )}
      {row.note && <span className="mp-row-note">{row.note}</span>}
    </div>
  );
}

/**
 * A form row is two teams' letters, not one row with two columns: side by side
 * under club headings the two strings read as one long run of letters. Split it
 * into a labelled row per side so each name sits next to its own five.
 */
function expandForm(rows: StatRow[], homeTeam: string, awayTeam: string) {
  return rows.flatMap((row) =>
    row.format === "form" && (row.home ?? row.away)
      ? [
          {
            ...row,
            label: homeTeam,
            value: row.home,
            home: undefined,
            away: undefined,
          },
          {
            ...row,
            label: awayTeam,
            value: row.away,
            home: undefined,
            away: undefined,
          },
        ].filter((side) => side.value)
      : [row],
  );
}

/**
 * Every block the view produced, in order. There is nothing to decide here —
 * `buildMatchView` has already dropped what has no value, so this renders
 * exactly what it is handed and never prints a placeholder.
 */
export function ContextBlocks({
  blocks,
  homeTeam,
  awayTeam,
}: {
  blocks: ContextBlock[];
  homeTeam: string;
  awayTeam: string;
}) {
  if (blocks.length === 0) return null;
  return (
    <div className="mp-blocks">
      {blocks.map((block) => {
        // Two columns are worth their width only when both sides have
        // something in them. With no enrichment for the opponent, a labelled
        // empty column is just a gap with a club name over it, so the block
        // falls back to plain statements.
        const rows = expandForm(block.rows, homeTeam, awayTeam);
        const compares =
          rows.some((row) => row.home !== undefined) &&
          rows.some((row) => row.away !== undefined);
        return (
          <section className="mp-block" key={block.id}>
            <h2 className="mp-block-title">{block.title}</h2>
            {compares && (
              <div className="mp-row mp-row-vs mp-row-heads">
                <span className="mp-row-label" />
                <span className="mp-row-home">{homeTeam}</span>
                <span className="mp-row-away">{awayTeam}</span>
              </div>
            )}
            {rows.map((row, index) => (
              <Row key={`${block.id}-${index}`} row={row} compare={compares} />
            ))}
            {block.detail && (
              <details className="mp-deeper" open>
                <summary>Deeper numbers</summary>
                {expandForm(block.detail, homeTeam, awayTeam).map(
                  (row, index) => (
                    <Row
                      key={`${block.id}-detail-${index}`}
                      row={row}
                      compare={compares}
                    />
                  ),
                )}
              </details>
            )}
          </section>
        );
      })}
    </div>
  );
}
