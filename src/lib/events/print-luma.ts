import { z } from "zod";
import { parse } from "csv-parse/sync";
import { GuestSchema, type PrintGuest } from "./print-jobs";

export const SYMPOSIUM_LUMA_ID = "evt-az4yQOZR33DBiid";
const ReplySchema = z.object({
  entries: z.array(z.object({
    api_id: z.string().min(1), name: z.string(), email: z.string(), approval_status: z.string(),
    registration_answers: z.array(z.object({ label: z.string(), value: z.unknown() })).default([]),
    event_tickets: z.array(z.object({ invalidated_at: z.unknown().optional() })).default([]),
  })).max(100), has_more: z.boolean(), next_cursor: z.string().nullable().optional(),
});
const valueText = (value: unknown): string => typeof value === "string" ? value : Array.isArray(value) ? value.filter(v => typeof v === "string").join(", ") : "";

export function lumaPrintPage(input: unknown): { guests: PrintGuest[]; more: boolean; cursor: string | null } {
  const reply = ReplySchema.parse(input);
  const guests = reply.entries.map(g => GuestSchema.parse({
    id: `luma:${g.api_id}`, name: g.name, email: g.email.trim().toLowerCase(), status: g.approval_status, source: "luma",
    organization: valueText(g.registration_answers.find(a => /^(primary affiliated organization name|organization|organisation|company|institution)$/i.test(a.label.trim()))?.value),
    tickets: Math.max(1, g.event_tickets.filter(t => !t.invalidated_at).length),
    badgeRole: g.registration_answers.some(a => /symposium participant|role/i.test(a.label) && /HQP Representative/i.test(valueText(a.value))) ? "HQP Representative" : "",
  }));
  return { guests, more: reply.has_more, cursor: reply.next_cursor ?? null };
}

export async function fetchLumaPrintGuests(fetcher: typeof fetch = fetch): Promise<PrintGuest[]> {
  const session = process.env.LUMA_SESSION_KEY?.trim().replace(/^luma\.auth-session-key=/, "");
  if (!session) throw new Error("Luma host connection is not configured. Import a Luma guest CSV while the host connection is renewed.");
  const guests: PrintGuest[] = [], cursors = new Set<string>();
  let cursor: string | null = null;
  for (let page = 0; page < 20; page++) {
    // Same host endpoint as Luma's Guests screen, verified 16 October 2026.
    const url = new URL("https://api.luma.com/event/admin/get-guests");
    url.search = new URLSearchParams({ event_api_id: SYMPOSIUM_LUMA_ID, pagination_limit: "100", query: "", sort_column: "registered_or_created_at", sort_direction: "desc", ...(cursor ? { pagination_cursor: cursor } : {}) }).toString();
    const response = await fetcher(url, { headers: { cookie: `luma.auth-session-key=${session}` }, cache: "no-store", signal: AbortSignal.timeout(12000) });
    if (response.status === 401 || response.status === 403) throw new Error("The Luma host connection has expired. Existing badges are safe; import the current Luma guest CSV until it is renewed.");
    if (!response.ok) throw new Error(`Luma could not be read (${response.status}). Existing print records have not changed.`);
    const result = lumaPrintPage(await response.json());
    guests.push(...result.guests);
    if (!result.more) {
      if (!guests.length) throw new Error("Luma returned an empty guest list. Existing print records were kept.");
      if (new Set(guests.map(g => g.id)).size !== guests.length) throw new Error("Luma returned duplicate guests. Please sync again.");
      return guests;
    }
    if (!result.cursor || cursors.has(result.cursor)) throw new Error("Luma pagination was incomplete. No partial guest list was saved.");
    cursors.add(result.cursor); cursor = result.cursor;
  }
  throw new Error("Luma exceeded the 2,000-guest limit. No partial guest list was saved.");
}

export function parseLumaPrintCsv(csv: string): PrintGuest[] {
  const rows = parse(csv, { columns: true, bom: true, skip_empty_lines: true, max_record_size: 20000 }) as Record<string, string>[];
  if (!rows.length || rows.length > 2000) throw new Error("Import between 1 and 2,000 guests.");
  const norm = (key: string) => key.toLowerCase().replace(/[^a-z0-9]/g, "");
  const read = (row: Record<string, string>, keys: string[]) => Object.entries(row).find(([key]) => keys.includes(norm(key)))?.[1]?.trim() ?? "";
  const guests = rows.map(row => {
    const email = read(row, ["email", "emailaddress"]).toLowerCase();
    const apiId = read(row, ["apiid", "guestid", "guestapiid"]);
    const name = read(row, ["name", "fullname", "guestname"]);
    const status = read(row, ["approvalstatus", "status"]).toLowerCase().replace(/\s+/g, "_");
    if (!name || (!apiId && !email) || !status) throw new Error("Use Luma's full guest export with Name, Email and Approval Status columns.");
    return GuestSchema.parse({ id: apiId ? `luma:${apiId}` : `luma-email:${email}`, name, email, status, source: "luma", organization: read(row, ["primaryaffiliatedorganizationname", "organization", "organisation", "company", "institution"]), tickets: Number(read(row, ["ticketcount", "quantity", "tickets"]) || 1), badgeRole: /HQP Representative/i.test(read(row, ["symposiumparticipant"])) ? "HQP Representative" : "" });
  });
  const grouped = new Map<string, PrintGuest>();
  for (const guest of guests) {
    const prior = grouped.get(guest.id);
    if (!prior) { grouped.set(guest.id, { ...guest }); continue; }
    if (prior.name !== guest.name || prior.email !== guest.email || prior.organization !== guest.organization || prior.status !== guest.status) throw new Error("This export has conflicting identities for one guest ID. Review the Luma guest list before importing.");
    // Luma's CSV has one row per ticket, including group bookings under one name.
    prior.tickets += guest.tickets;
  }
  return [...grouped.values()].map(g => GuestSchema.parse(g));
}
