/**
 * Read a pasted roster (a spreadsheet copied as text) into entries.
 *
 * Every address in the paste is taken, wherever its column is — nobody on
 * this side controls those sheets' headers, and they have been renamed
 * before.
 *
 * The NAME is read only from a column whose header says it is one ("Name",
 * "Full name", or "First name" + "Last name"). It used to be guessed as
 * the longest other cell, which on the ENGAGE/EXPERIENCE sheet is the
 * institution — "Hospital for Sick Children" stored as a person's name.
 * No such header, no name: blank beats wrong.
 *
 * Pure module: no Prisma, no I/O.
 */
import { emailKey } from "./email-key";

export interface RosterRow { emailKey: string; email: string; name: string | null }

const split = (line: string) => line.split(/[,\t;]/).map((c) => c.trim().replace(/^["']|["']$/g, "").trim());
/** A header that names an organisation, not a person. */
const NOT_A_PERSON = /institution|organi[sz]ation|universit|company|school|employer|supervisor|program|lab\b|department|faculty|hospital|sponsor|partner/i;

export function parseRoster(text: string, maxRows = 20_000): { rows: RosterRow[]; skipped: number } {
  const lines = text.split(/\r?\n/).slice(0, maxRows).filter((l) => l.trim());
  // A first line with no address in it is a header row.
  const head = lines.length && !split(lines[0]).some((c) => emailKey(c)) ? split(lines[0]).map((h) => h.toLowerCase()) : null;
  const col = (re: RegExp) => (head ? head.findIndex((h) => re.test(h) && !NOT_A_PERSON.test(h)) : -1);
  const first = col(/first\s*name|given\s*name|^first$/);
  const last = col(/last\s*name|surname|family\s*name|^last$/);
  const full = col(/\bname\b/);

  const seen = new Set<string>();
  const rows: RosterRow[] = [];
  let skipped = 0;
  for (const line of head ? lines.slice(1) : lines) {
    const cells = split(line);
    const found = cells.map((raw) => ({ raw, key: emailKey(raw) })).find((c) => c.key);
    if (!found?.key) { skipped += 1; continue; }
    if (seen.has(found.key)) continue;
    seen.add(found.key);
    const person =
      first >= 0 && last >= 0 ? `${cells[first] ?? ""} ${cells[last] ?? ""}`.trim()
      : full >= 0 ? (cells[full] ?? "")
      : "";
    const name = person && person.length < 120 && /\p{L}/u.test(person) && !emailKey(person) ? person : null;
    rows.push({ emailKey: found.key, email: found.raw, name });
  }
  return { rows, skipped };
}
