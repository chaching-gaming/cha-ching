export type CsvColumn<T> = {
  key: keyof T & string;
  header: string;
  /** Runs before quoting; cast `value` to the underlying column type. */
  format?: (value: unknown, row: T) => string;
};

const NEEDS_QUOTING = /[",\r\n]/;

function escapeCell(raw: unknown): string {
  if (raw === null || raw === undefined) return '';
  const str = typeof raw === 'string' ? raw : String(raw);
  if (!NEEDS_QUOTING.test(str)) return str;
  return `"${str.replace(/"/g, '""')}"`;
}

/**
 * Serialize `rows` into an RFC 4180 CSV string (CRLF line endings, double-quote
 * escaping). `format` runs before quoting so column formatters can stringify
 * jsonb, dates, etc.
 */
export function toCsv<T extends Record<string, unknown>>(
  rows: readonly T[],
  columns: readonly CsvColumn<T>[],
): string {
  const header = columns.map((c) => escapeCell(c.header)).join(',');
  const body = rows.map((row) =>
    columns
      .map((col) => {
        const raw = row[col.key];
        const rendered = col.format ? col.format(raw, row) : raw;
        return escapeCell(rendered);
      })
      .join(','),
  );
  return [header, ...body].join('\r\n');
}
