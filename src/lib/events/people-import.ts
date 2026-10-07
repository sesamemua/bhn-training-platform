import { parse } from "csv-parse/sync";
import { identityText, PersonInput } from "./people-plan";

/** Quoted commas, tabs and multiline biographies survive spreadsheet paste. */
export function parsePeopleTable(text: string): PersonInput[] | null {
  const first = text.trim().split(/\r?\n/)[0] ?? "";
  const aliases: Record<string, keyof PersonInput> = { name: "fullName", "full name": "fullName", company: "organization", organization: "organization", organisation: "organization", title: "title", role: "title", bio: "bio", biography: "bio", email: "email" };
  const delimiter = first.includes("\t") ? "\t" : ",";
  // Do not attempt to parse prose with the CSV grammar.
  if (!first.split(delimiter).some((h) => aliases[identityText(h)] === "fullName")) return null;
  const rows: string[][] = parse(text, { delimiter, bom: true, skip_empty_lines: true, relax_column_count: true });
  const columns = rows[0]?.map((h) => aliases[identityText(h)]);
  if (!columns?.includes("fullName")) return null;
  if (rows.length > 101) throw new Error("Paste up to 100 people at a time.");
  return rows.slice(1).map((row, index) => {
    if (row.length > columns.length) throw new Error(`Check the columns or quotation marks on row ${index + 2}.`);
    const value: Record<string, string> = {};
    columns.forEach((key, i) => { if (key) value[key] = row[i] ?? ""; });
    const parsed = PersonInput.safeParse(value);
    if (!parsed.success) throw new Error(`Check the name and email on row ${index + 2}.`);
    return parsed.data;
  });
}
