import { z } from "zod";
import { INSTITUTIONS } from "@/lib/equip/institutions";

const text = (max: number) => z.string().trim().max(max);
export const GuestSchema = z.object({
  id: text(150).min(1), name: text(160), email: text(254), organization: text(250),
  status: text(50), tickets: z.number().int().min(0).max(500), source: z.enum(["luma", "manual"]), badgeRole: text(120).default(""),
  /** "Current Primary Affiliation Position" from the registration — printed just above the organization. */
  position: text(200).optional(),
});
export type PrintGuest = z.infer<typeof GuestSchema>;
export const BadgeEditSchema = z.object({ name: text(160).min(2), position: text(200).optional(), organization: text(250), extra: text(200), reviewed: z.boolean() });
export type BadgeEdit = z.infer<typeof BadgeEditSchema>;
export const BadgeSchema = z.object({ id: text(150), name: text(160), position: text(200).optional(), organization: text(250), extra: text(200) });
export type PrintBadge = z.infer<typeof BadgeSchema>;
const TemplateSchema = z.object({ key: text(150), name: text(200) });
export const PrintJobSchema = z.object({
  id: z.string().uuid(), label: text(120).min(1), kind: z.enum(["badges", "tents", "agenda"]),
  createdAt: z.string().datetime(), createdBy: text(200), assignedTo: text(200), notes: text(1000),
  copies: z.number().int().min(1).max(500), status: z.enum(["ready", "printed", "cancelled"]),
  badges: z.array(BadgeSchema).max(2000), printedIds: z.array(text(150)).max(2000),
  printedAt: z.string().datetime().nullable(), printedBy: text(200).nullable(),
  skip: z.number().int().min(0).max(5), offsetX: z.number().min(-5).max(5), offsetY: z.number().min(-5).max(5),
});
export type PrintJob = z.infer<typeof PrintJobSchema>;
export const PrintBoardSchema = z.object({
  guests: z.array(GuestSchema).max(2000), edits: z.record(z.string(), BadgeEditSchema),
  jobs: z.array(PrintJobSchema).max(150), syncedAt: z.string().datetime().nullable(), syncSource: z.enum(["luma", "csv"]).optional(),
  tentText: text(2000), agendaText: text(30000),
  tentTemplate: TemplateSchema.nullable(), agendaTemplate: TemplateSchema.nullable(),
});
export type PrintBoard = z.infer<typeof PrintBoardSchema>;
export type PrintPerson = PrintBadge & { email: string; sourceName: string; sourceOrganization: string; status: string; source: PrintGuest["source"]; tickets: number; issues: string[]; suggestion: string | null; printStatus: "unprinted" | "queued" | "printed" | "changed" };
export type PrintWorkspace = { board: PrintBoard; people: PrintPerson[]; version: string | null; autoSyncAvailable: boolean };
export type PrintIdentity = { fullName: string; email: string; organization: string; title: string; tags?: string[] };

export const PrintActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("sync") }),
  z.object({ action: z.literal("import"), csv: z.string().min(1).max(1000000) }),
  z.object({ action: z.literal("edit"), id: text(150), badge: BadgeEditSchema }),
  z.object({ action: z.literal("add"), badge: BadgeEditSchema, email: text(254).refine(v => !v || z.email().safeParse(v).success) }),
  z.object({ action: z.literal("documents"), tentText: text(2000), agendaText: text(30000), clearTemplate: z.enum(["tents", "agenda"]).optional() }),
  z.object({ action: z.literal("create"), kind: z.enum(["badges", "tents", "agenda"]), label: text(120).min(1), ids: z.array(text(150)).max(2000), copies: z.number().int().min(1).max(500), assignedTo: text(200), notes: text(1000), allowReprint: z.boolean(), skip: z.number().int().min(0).max(5), offsetX: z.number().min(-5).max(5), offsetY: z.number().min(-5).max(5) }),
  z.object({ action: z.literal("printed"), jobId: z.string().uuid(), ids: z.array(text(150)).max(2000) }),
  z.object({ action: z.literal("cancel"), jobId: z.string().uuid() }),
  /** Remove a batch and its PDF entirely — including its print record. */
  z.object({ action: z.literal("delete"), jobId: z.string().uuid() }),
]);
export type PrintAction = z.infer<typeof PrintActionSchema>;

const normalized = (v: string) => v.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const organizationAliases: Record<string, string> = {
  uoft: "University of Toronto", uotf: "University of Toronto", utoronto: "University of Toronto", uoftoronto: "University of Toronto", universityoftoronto: "University of Toronto", torontouniversity: "University of Toronto",
  ryerson: "Toronto Metropolitan University", ryersonuniversity: "Toronto Metropolitan University", ccrm: "CCRM", catti: "CATTI", castl: "CASTL",
};
export function standardOrganization(value: string): string {
  const clean = value.trim().replace(/\s+/g, " "), key = normalized(clean);
  if (organizationAliases[key]) return organizationAliases[key];
  if (/^(universityoftoronto|uoftoronto|uoft)(stgeorge|scarborough|mississauga|department|faculty|utsc|utm)/.test(key)) return "University of Toronto";
  const parts = clean.split(/([,/;])/);
  if (parts.length > 1) return parts.map((part, i) => i % 2 ? part + " " : standardOrganization(part)).join("");
  const known = INSTITUTIONS.find(i => [i.name, i.shortName ?? ""].some(n => n && normalized(n) === key));
  return known?.name ?? clean;
}

export function capitalizeName(value: string): string {
  return value.trim().replace(/\s+/g, " ").split(" ").map(word => {
    if (/[a-zà-ž]/u.test(word) && /[A-ZÀ-Ž]/u.test(word)) return word;
    if (/^(II|III|IV|VI|KJ|CT)$/u.test(word)) return word;
    const titled = word.toLocaleLowerCase("en").replace(/(^|[-'’])(\p{L})/gu, (_, prefix: string, letter: string) => prefix + letter.toLocaleUpperCase("en"));
    return titled.replace(/^Mc(\p{L})/u, (_, letter: string) => "Mc" + letter.toLocaleUpperCase("en"));
  }).join(" ");
}

const organizationName = /\b(hub|university|institute|laboratory|labs?|company|corporation|network|biohubnet|inc|llc|ltd|solutions|biosciences|biotech|pharma|centre|center|college|foundation)\b|\bhi[³3]\b/i;
const approved = (status: string) => ["approved", "going", "checked_in"].includes(status.toLowerCase());
// The position joins the fingerprint only when there is one, so a badge printed before positions existed still matches while it has none.
export const badgeFingerprint = (b: PrintBadge) => JSON.stringify([b.name, b.organization, b.extra, ...(b.position ? [b.position] : [])]);

export function printPeople(board: PrintBoard, identities: PrintIdentity[] = []): PrintPerson[] {
  return board.guests.map(g => {
    const candidates = identities.filter(p => g.email && p.email.toLowerCase() === g.email.toLowerCase());
    const identity = candidates.length === 1 ? candidates[0] : null;
    // The organizer explicitly identified this registration; an email guess alone never expands initials.
    const verified = g.email.toLowerCase() === "an.leung@utoronto.ca" ? "Andrea Leung" : null;
    const needsIdentity = organizationName.test(g.name) || g.name.trim().split(/\s+/).length < 2;
    const inferredName = verified ?? (needsIdentity && identity ? identity.fullName : g.name);
    const edit = board.edits[g.id];
    const badge: PrintBadge = { id: g.id, name: edit?.name ?? capitalizeName(inferredName), position: edit?.position ?? (g.position || identity?.title || "").trim(), organization: edit?.organization ?? standardOrganization(g.organization || identity?.organization || ""), extra: edit?.extra ?? (g.badgeRole || (/HQP Representative/i.test(`${identity?.title ?? ""} ${identity?.tags?.join(" ") ?? ""}`) ? "HQP Representative" : "")) };
    const issues: string[] = [];
    const emailParts = g.email.split("@")[0].split(/[._-]+/).filter(w => /^[a-z]{3,}$/i.test(w));
    const suggestion = emailParts.length === 2 ? capitalizeName(emailParts.join(" ")) : null;
    if (!edit?.reviewed) {
      if (!badge.name || organizationName.test(badge.name) || (badge.organization && normalized(badge.name) === normalized(badge.organization))) issues.push("Name appears to be an organization");
      else if (badge.name.split(/\s+/).length < 2) issues.push("Check incomplete name");
      if (suggestion && !verified && !identity && emailParts.every(p => !normalized(badge.name).includes(normalized(p)))) issues.push("Name and email appear inconsistent");
      if (/[`<>@\d]/.test(badge.name)) issues.push("Check unusual characters in name");
      if (!badge.organization) issues.push("Organization missing");
      if (candidates.length > 1) issues.push("Multiple matching people profiles");
      if (g.email && board.guests.filter(p => p.email.toLowerCase() === g.email.toLowerCase() && approved(p.status)).length > 1) issues.push("Multiple approved registrations use this email");
    }
    if (g.tickets > 1) issues.push(`${g.tickets} tickets: additional guests need individual names`);
    if (/[^\p{Script=Latin}\p{Script=Greek}\p{Script=Cyrillic}\p{N}\p{P}\p{Zs}\p{M}\s]/u.test([badge.name, badge.organization, badge.extra].join(" "))) issues.push("Check font support for this badge");
    const matches = board.jobs.filter(j => j.kind === "badges" && j.badges.some(b => b.id === g.id));
    const same = (j: PrintJob) => j.badges.some(b => b.id === g.id && badgeFingerprint(b) === badgeFingerprint(badge));
    const printed = matches.some(j => j.printedIds.includes(g.id) && same(j));
    const queued = matches.some(j => j.status === "ready" && same(j) && !j.printedIds.includes(g.id));
    const printStatus: PrintPerson["printStatus"] = printed ? "printed" : queued ? "queued" : matches.some(j => j.printedIds.includes(g.id)) ? "changed" : "unprinted";
    return { ...badge, email: g.email, sourceName: g.name, sourceOrganization: g.organization, status: g.status, source: g.source, tickets: g.tickets, issues, suggestion, printStatus };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

export function mergePrintGuests(board: PrintBoard, incoming: PrintGuest[], at: string, source: "luma" | "csv" = "luma"): PrintBoard {
  if (new Set(incoming.map(g => g.id)).size !== incoming.length) throw new Error("Luma returned duplicate guest IDs. Nothing was replaced.");
  const next = structuredClone(board);
  const ids = new Set(incoming.map(g => g.id));
  next.guests = [...next.guests.filter(g => g.source === "manual" || !ids.has(g.id)).map(g => g.source === "luma" ? { ...g, status: "removed" } : g), ...incoming];
  for (const guest of incoming) {
    const old = board.guests.find(g => g.id === guest.id);
    if (old && (old.name !== guest.name || old.email !== guest.email || old.organization !== guest.organization || (old.position ?? "") !== (guest.position ?? "")) && next.edits[guest.id]) next.edits[guest.id].reviewed = false;
  }
  next.syncedAt = at; next.syncSource = source;
  return PrintBoardSchema.parse(next);
}

export function applyPrintAction(board: PrintBoard, people: PrintPerson[], action: Exclude<PrintAction, { action: "sync" | "import" }>, actor: string, id: string, at: string): { board: PrintBoard; job?: PrintJob } {
  const next = structuredClone(board);
  if (action.action === "edit") {
    if (!next.guests.some(g => g.id === action.id)) throw new Error("This guest no longer exists.");
    next.edits[action.id] = { ...action.badge, organization: standardOrganization(action.badge.organization) };
  } else if (action.action === "add") {
    next.guests.push({ id, name: action.badge.name, email: action.email, organization: action.badge.organization, position: action.badge.position ?? "", status: "approved", source: "manual", tickets: 1, badgeRole: "" });
    next.edits[id] = { ...action.badge, organization: standardOrganization(action.badge.organization) };
  } else if (action.action === "documents") {
    next.tentText = action.tentText; next.agendaText = action.agendaText;
    if (action.clearTemplate === "tents") next.tentTemplate = null;
    if (action.clearTemplate === "agenda") next.agendaTemplate = null;
  } else if (action.action === "create") {
    if (next.jobs.length >= 150) throw new Error("This event has reached its print-batch limit.");
    const ids = [...new Set(action.ids)];
    const selected = ids.map(key => people.find(p => p.id === key));
    if (action.kind === "badges") {
      if (!ids.length || selected.some(p => !p)) throw new Error("Choose at least one current guest.");
      if (selected.some(p => !approved(p!.status))) throw new Error("Only approved guests can enter a badge batch.");
      if (selected.some(p => p!.issues.some(issue => !issue.includes("additional guests")))) throw new Error("Resolve the selected name and organization flags before creating this batch.");
      if (!action.allowReprint && selected.some(p => p!.printStatus === "printed" || p!.printStatus === "queued")) throw new Error("Some badges are printed or queued. Enable reprinting to include them deliberately.");
    }
    if (action.kind === "agenda" && !next.agendaText && !next.agendaTemplate) throw new Error("Add an agenda or upload the final PDF first.");
    const badges = action.kind === "badges" ? selected.map(p => ({ id: p!.id, name: p!.name, ...(p!.position ? { position: p!.position } : {}), organization: p!.organization, extra: p!.extra })) : [];
    const job: PrintJob = { id, label: action.label, kind: action.kind, createdAt: at, createdBy: actor, assignedTo: action.assignedTo, notes: action.notes, copies: action.kind === "badges" ? 1 : action.copies, status: "ready", badges, printedIds: [], printedAt: null, printedBy: null, skip: action.skip, offsetX: action.offsetX, offsetY: action.offsetY };
    next.jobs.unshift(job);
    return { board: PrintBoardSchema.parse(next), job };
  } else if (action.action === "delete") {
    if (!next.jobs.some(j => j.id === action.jobId)) throw new Error("This batch has already been deleted.");
    next.jobs = next.jobs.filter(j => j.id !== action.jobId);
  } else {
    const job = next.jobs.find(j => j.id === action.jobId);
    if (!job || job.status !== "ready") throw new Error("This batch is no longer waiting to print.");
    if (action.action === "cancel") job.status = "cancelled";
    else {
      if (job.kind === "badges") {
        if (!action.ids.length || action.ids.some(id => !job.badges.some(b => b.id === id))) throw new Error("Choose badges from this batch to mark printed.");
        job.printedIds = [...new Set([...job.printedIds, ...action.ids])];
        if (job.printedIds.length === job.badges.length) job.status = "printed";
      } else job.status = "printed";
      job.printedAt = at; job.printedBy = actor;
    }
  }
  return { board: PrintBoardSchema.parse(next) };
}

/** Something on the badge list a person has to act on, grouped by what to do about it. */
export type AttentionKind = "review" | "reprint" | "unregistered" | "guests";
export interface AttentionItem { kind: AttentionKind; id: string; name: string; detail: string }
export const ATTENTION_LABELS: Record<AttentionKind, { title: string; action: string }> = {
  review: { title: "Check before printing", action: "Fix badge" },
  reprint: { title: "Changed since it was printed", action: "Add to reprint" },
  unregistered: { title: "Has a badge but is no longer registered", action: "Review" },
  guests: { title: "Extra tickets without names", action: "Review" },
};

/**
 * Everything on the badge list that needs a person: details to check
 * before a badge can be printed, printed badges whose details have since
 * changed, badges made for people who are no longer registered, and
 * tickets bought for guests who have not been named. Ordered by group,
 * then name.
 */
export function attentionItems(people: PrintPerson[]): AttentionItem[] {
  const out: AttentionItem[] = [];
  for (const p of people) {
    const live = approved(p.status);
    const flags = p.issues.filter((i) => !i.includes("additional guests"));
    if (live && flags.length) out.push({ kind: "review", id: p.id, name: p.name || p.sourceName, detail: flags.join(" · ") });
    if (live && p.printStatus === "changed") out.push({ kind: "reprint", id: p.id, name: p.name, detail: "The printed badge no longer matches the name or organization." });
    if (!live && (p.printStatus === "printed" || p.printStatus === "queued")) out.push({ kind: "unregistered", id: p.id, name: p.name, detail: `Registration is ${p.status.replace(/_/g, " ")}; the badge is ${p.printStatus}.` });
    if (live && p.tickets > 1) out.push({ kind: "guests", id: p.id, name: p.name, detail: `${p.tickets - 1} additional guest${p.tickets > 2 ? "s" : ""} need${p.tickets > 2 ? "" : "s"} a name for a badge.` });
  }
  const order: AttentionKind[] = ["review", "reprint", "unregistered", "guests"];
  return out.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || a.name.localeCompare(b.name));
}
