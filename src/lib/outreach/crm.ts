/**
 * Marketing CRM — the pure half (no database, no Node APIs, safe in client
 * components), so every rule here is unit tested: stages, lead score,
 * smart-list filters, CSV in/out, sequences, UTM links. Tracking tokens live
 * in crm-track.ts (server only — they need node:crypto).
 */

// ── Stages ────────────────────────────────────────────────────────────────

export const LIFECYCLE_STAGES = [
  { key: "subscriber", label: "Subscriber" },
  { key: "lead", label: "Lead" },
  { key: "engaged", label: "Engaged" },
  { key: "partner", label: "Partner" },
  { key: "customer", label: "Sponsor / customer" },
  { key: "other", label: "Other" },
] as const;
export type Lifecycle = (typeof LIFECYCLE_STAGES)[number]["key"];

export const LEAD_STATUSES = [
  { key: "new", label: "New" },
  { key: "attempting", label: "Attempting" },
  { key: "connected", label: "Connected" },
  { key: "qualified", label: "Qualified" },
  { key: "unqualified", label: "Unqualified" },
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number]["key"];

/** probability = the share of the amount counted in the weighted pipeline. */
export const DEAL_STAGES = [
  { key: "lead", label: "Lead", probability: 0.1 },
  { key: "contacted", label: "Contacted", probability: 0.25 },
  { key: "proposal", label: "Proposal sent", probability: 0.5 },
  { key: "negotiation", label: "Negotiation", probability: 0.75 },
  { key: "won", label: "Won", probability: 1 },
  { key: "lost", label: "Lost", probability: 0 },
] as const;
export type DealStage = (typeof DEAL_STAGES)[number]["key"];

export const isLifecycle = (v: unknown): v is Lifecycle => LIFECYCLE_STAGES.some((s) => s.key === v);
export const isLeadStatus = (v: unknown): v is LeadStatus => LEAD_STATUSES.some((s) => s.key === v);
export const isDealStage = (v: unknown): v is DealStage => DEAL_STAGES.some((s) => s.key === v);
export const labelOf = (list: readonly { key: string; label: string }[], key: string) =>
  list.find((s) => s.key === key)?.label ?? key;

export function pipelineTotals(deals: { stage: string; amount: number }[]) {
  let open = 0, weighted = 0, won = 0;
  for (const d of deals) {
    const s = DEAL_STAGES.find((x) => x.key === d.stage);
    if (!s) continue;
    if (s.key === "won") won += d.amount;
    else if (s.key !== "lost") open += d.amount;
    weighted += d.amount * s.probability;
  }
  return { open, weighted: Math.round(weighted), won };
}

export const cad = (n: number) =>
  new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(n);

// ── Lead score ────────────────────────────────────────────────────────────

export interface ScoreInput {
  touches: number;
  sends: number;
  opens: number;
  clicks: number;
  forms: number;
  registrations: number;
  hasAccount: boolean;
  unsubscribed: boolean;
  lifecycle: string;
}

/** 0–100. Engagement beats volume: a click outweighs three sends. */
export function leadScore(i: ScoreInput): number {
  if (i.unsubscribed) return 0;
  const raw =
    Math.min(i.touches, 4) * 5 +
    Math.min(i.sends, 3) * 3 +
    Math.min(i.opens, 3) * 5 +
    Math.min(i.clicks, 2) * 12 +
    Math.min(i.forms, 2) * 10 +
    Math.min(i.registrations, 2) * 10 +
    (i.hasAccount ? 10 : 0) +
    (i.lifecycle === "partner" || i.lifecycle === "customer" ? 10 : 0);
  return Math.min(100, raw);
}

export const scoreBand = (s: number) => (s >= 60 ? "hot" : s >= 30 ? "warm" : "cold");

// ── Smart-list filters ────────────────────────────────────────────────────

export interface CrmFilter {
  q?: string;
  lifecycle?: string;
  leadStatus?: string;
  owner?: string;
  listId?: string;
  minScore?: number;
  hasEmail?: boolean;
}

export interface FilterablePerson {
  values: Record<string, string>;
  lifecycle: string;
  leadStatus: string;
  ownerName: string;
  listIds: string[];
  score: number;
  unsubscribed?: boolean;
}

export function sanitizeFilter(input: unknown): CrmFilter | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 120) : undefined);
  const out: CrmFilter = {
    q: str(o.q),
    lifecycle: isLifecycle(o.lifecycle) ? o.lifecycle : undefined,
    leadStatus: isLeadStatus(o.leadStatus) ? o.leadStatus : undefined,
    owner: str(o.owner),
    listId: str(o.listId),
    minScore: typeof o.minScore === "number" && o.minScore > 0 ? Math.min(100, Math.round(o.minScore)) : undefined,
    hasEmail: o.hasEmail === true ? true : undefined,
  };
  for (const k of Object.keys(out) as (keyof CrmFilter)[]) if (out[k] === undefined) delete out[k];
  return Object.keys(out).length ? out : null;
}

export function matchesFilter(p: FilterablePerson, f: CrmFilter): boolean {
  if (f.q) {
    const hay = Object.values(p.values).join(" ").toLowerCase();
    if (!f.q.toLowerCase().split(/\s+/).every((w) => hay.includes(w))) return false;
  }
  if (f.lifecycle && p.lifecycle !== f.lifecycle) return false;
  if (f.leadStatus && p.leadStatus !== f.leadStatus) return false;
  if (f.owner && p.ownerName !== f.owner) return false;
  if (f.listId && !p.listIds.includes(f.listId)) return false;
  if (f.minScore && p.score < f.minScore) return false;
  if (f.hasEmail && !(p.values.email ?? "").includes("@")) return false;
  return true;
}

export function describeFilter(f: CrmFilter, listName?: (id: string) => string): string {
  const parts: string[] = [];
  if (f.q) parts.push(`“${f.q}”`);
  if (f.lifecycle) parts.push(labelOf(LIFECYCLE_STAGES, f.lifecycle));
  if (f.leadStatus) parts.push(labelOf(LEAD_STATUSES, f.leadStatus));
  if (f.owner) parts.push(`owner ${f.owner}`);
  if (f.listId) parts.push(`on ${listName?.(f.listId) ?? "a list"}`);
  if (f.minScore) parts.push(`score ≥ ${f.minScore}`);
  if (f.hasEmail) parts.push("has email");
  return parts.join(" · ") || "Everyone";
}

// ── CSV ───────────────────────────────────────────────────────────────────

/** RFC 4180-ish: quoted fields, doubled quotes, CRLF or LF, BOM stripped. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"' && s[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}

/** Quotes when needed; a leading = + - @ gets a ' so a spreadsheet won't run it as a formula. */
function csvCell(v: string): string {
  const safe = /^[=+\-@]/.test(v) ? `'${v}` : v;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}
export const toCsv = (rows: string[][]) => rows.map((r) => r.map((c) => csvCell(c ?? "")).join(",")).join("\r\n");

const HEADER_ALIASES: Record<string, string[]> = {
  email: ["email", "e-mail", "email address", "mail"],
  name: ["name", "full name", "contact", "contact name"],
  org: ["org", "organisation", "organization", "company", "institution"],
  title: ["title", "job title", "role", "position", "title and department"],
};

/** Map CSV headers onto person-column keys (by key, label, or common alias). */
export function mapHeaders(headers: string[], columns: { key: string; label: string }[]): (string | null)[] {
  return headers.map((h) => {
    const n = h.trim().toLowerCase();
    const col = columns.find((c) => c.key.toLowerCase() === n || c.label.toLowerCase() === n);
    if (col) return col.key;
    for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
      if (aliases.includes(n) && columns.some((c) => c.key === key)) return key;
    }
    if (n === "first name" || n === "last name") return n === "first name" ? "__first" : "__last";
    return null;
  });
}

/** CSV text → person value objects (first/last joined into name). */
export function csvToPeople(text: string, columns: { key: string; label: string }[]): Record<string, string>[] {
  const [head, ...body] = parseCsv(text);
  if (!head) return [];
  const map = mapHeaders(head, columns);
  return body.slice(0, 2000).map((r) => {
    const v: Record<string, string> = {};
    let first = "", last = "";
    r.forEach((cell, i) => {
      const k = map[i];
      const val = cell.trim().slice(0, 1000);
      if (k === "__first") first = val;
      else if (k === "__last") last = val;
      else if (k && val) v[k] = val;
    });
    if (!v.name && (first || last)) v.name = `${first} ${last}`.trim();
    return v;
  }).filter((v) => Object.keys(v).length > 0);
}

// ── Companies ─────────────────────────────────────────────────────────────

export const orgKey = (org: string) => org.trim().toLowerCase().replace(/\s+/g, " ");

// ── Sequences ─────────────────────────────────────────────────────────────

export interface SequenceStep { delayDays: number; subject: string; body: string }

export function sanitizeSteps(input: unknown): SequenceStep[] | null {
  if (!Array.isArray(input) || input.length === 0 || input.length > 10) return null;
  const out: SequenceStep[] = [];
  for (const raw of input) {
    const o = (raw ?? {}) as Record<string, unknown>;
    const subject = typeof o.subject === "string" ? o.subject.trim().slice(0, 200) : "";
    const body = typeof o.body === "string" ? o.body.trim().slice(0, 8000) : "";
    const delay = Number(o.delayDays);
    if (!subject || !body || !Number.isFinite(delay) || delay < 0 || delay > 365) return null;
    out.push({ subject, body, delayDays: Math.round(delay) });
  }
  return out;
}

const DAY = 86_400_000;
export const dueAfter = (from: Date, delayDays: number) => new Date(from.getTime() + delayDays * DAY);

/** Where an enrolment goes after step `sent` goes out. */
export function advance(steps: SequenceStep[], sent: number, now: Date): { step: number; nextDueAt: Date | null; status: "active" | "done" } {
  const next = sent + 1;
  if (next >= steps.length) return { step: next, nextDueAt: null, status: "done" };
  return { step: next, nextDueAt: dueAfter(now, steps[next].delayDays), status: "active" };
}

// ── UTM links ─────────────────────────────────────────────────────────────

export interface UtmInput { url: string; source: string; medium: string; campaign: string; content?: string; term?: string }

export function buildUtmUrl(i: UtmInput): string | null {
  let u: URL;
  try { u = new URL(i.url.trim()); } catch { return null; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const set = (k: string, v?: string) => { if (v && v.trim()) u.searchParams.set(k, v.trim().toLowerCase().replace(/\s+/g, "-")); };
  set("utm_source", i.source);
  set("utm_medium", i.medium);
  set("utm_campaign", i.campaign);
  set("utm_content", i.content);
  set("utm_term", i.term);
  return u.toString();
}

export function slugify(s: string): string {
  return s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
}

// ── Forms → CRM ───────────────────────────────────────────────────────────

/** Best-effort name / organisation from a form's answers (field ids vary by form). */
export function guessIdentity(answers: Record<string, unknown>): { name: string; org: string } {
  const pick = (re: RegExp) => {
    for (const [k, v] of Object.entries(answers)) if (re.test(k) && typeof v === "string" && v.trim()) return v.trim().slice(0, 200);
    return "";
  };
  const first = pick(/^(first[_-]?name|given[_-]?name|fname)$/i);
  const last = pick(/^(last[_-]?name|surname|family[_-]?name|lname)$/i);
  const name = pick(/^(full[_-]?name|name|your[_-]?name)$/i) || `${first} ${last}`.trim();
  const org = pick(/^(org|organi[sz]ation|company|institution|affiliation|employer)$/i);
  return { name, org };
}

export const CRM_CAPTURE_SETTING = "crmCaptureForms";
