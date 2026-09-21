/**
 * CSV, including quoted cells containing commas and newlines.
 *
 * Hand-rolled because splitting on commas is wrong for the first
 * institution name that contains one — "University of Toronto,
 * Mississauga" — and that is exactly the data this reads.
 *
 * Lives outside the server-actions file because a "use server" module
 * may only export async functions.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else quoted = false;
      } else cell += c;
      continue;
    }
    if (c === '"') { quoted = true; continue; }
    if (c === ",") { row.push(cell); cell = ""; continue; }
    if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((v) => v.trim())) rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += c;
  }
  row.push(cell);
  if (row.some((v) => v.trim())) rows.push(row);
  return rows;
}

/** Rows → CSV text. Cells with a comma, quote or line break are quoted. */
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  const esc = (v: string | number | null | undefined) => {
    const s = v == null ? "" : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(esc).join(",")).join("\n");
}
