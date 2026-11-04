/** SQL text for the D1 import file. Apostrophes are `char(39)` pieces. */
export const MAX_STATEMENT_BYTES = 100_000;

export type SqlValue = string | number | null;

export function quoteIdent(name: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new Error(`Unexpected identifier ${name}`);
  }
  return `"${name}"`;
}

/**
 * Wrangler's statement splitter ends a quoted string at the next quote and does
 * not treat a doubled quote as an escape. Build apostrophes with char(39) so
 * the splitter and SQLite agree.
 */
export function sqlLiteral(value: SqlValue): string {
  if (value === null) return "NULL";
  if (typeof value === "number") {
    if (!Number.isInteger(value) || !Number.isFinite(value)) {
      throw new Error(`Refusing non-integer SQL number ${value}`);
    }
    return String(value);
  }
  if (!value.includes("'")) return `'${value}'`;
  return value
    .split("'")
    .map((part) => `'${part}'`)
    .join(" || char(39) || ");
}

export function insertStatements(
  table: string,
  columns: readonly string[],
  rows: readonly SqlValue[][],
): string[] {
  if (rows.length === 0) return [];
  const header = `INSERT INTO ${quoteIdent(table)} (${columns.map(quoteIdent).join(", ")}) VALUES\n`;
  const statements: string[] = [];
  let chunk: string[] = [];

  const statement = (tuples: string[]) => header + tuples.join(",\n") + ";\n";
  const flush = () => {
    const sql = statement(chunk);
    if (Buffer.byteLength(sql) >= MAX_STATEMENT_BYTES) {
      throw new Error(
        `${table} statement is ${Buffer.byteLength(sql)} bytes (limit ${MAX_STATEMENT_BYTES})`,
      );
    }
    statements.push(sql);
  };

  for (const row of rows) {
    const tuple = `(${row.map((cell) => sqlLiteral(cell)).join(", ")})`;
    if (chunk.length === 0) {
      chunk.push(tuple);
      if (Buffer.byteLength(statement(chunk)) >= MAX_STATEMENT_BYTES) {
        throw new Error(`one ${table} row is over 100 KB`);
      }
      continue;
    }
    const next = statement([...chunk, tuple]);
    if (Buffer.byteLength(next) >= MAX_STATEMENT_BYTES) {
      flush();
      chunk = [tuple];
      if (Buffer.byteLength(statement(chunk)) >= MAX_STATEMENT_BYTES) {
        throw new Error(`one ${table} row is over 100 KB`);
      }
      continue;
    }
    chunk.push(tuple);
  }
  if (chunk.length > 0) flush();
  return statements;
}
