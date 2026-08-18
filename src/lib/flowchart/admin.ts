/**
 * The admin panel, derived from the chart.
 *
 * The same document decides three things: what the chart draws, what the
 * form asks, and what the people running the event see afterwards. That
 * last one is not a separate design — a registrations table is the
 * questions as columns, plus where each person has got to in the process,
 * and both of those are already written down in the chart.
 *
 * Deriving it means the panel cannot drift from the form. Add a question
 * and a column appears; add a step and a stage appears.
 */
import { fieldsOf, orderedFields } from "./form";
import type { ChartDoc, FlowNode } from "./types";

export interface AdminColumn {
  key: string;
  label: string;
  /** The box it came from, so the panel can link back to the chart. */
  nodeId: string;
  /** The question type, for how the cell should be rendered/filtered. */
  type: string;
  /** The box it came from — columns are grouped by it in the header. */
  group: string;
  /** Required questions make columns worth flagging when empty. */
  required: boolean;
}

/** One column per question, in the order the form asks them. */
export function adminColumns(doc: ChartDoc): AdminColumn[] {
  return orderedFields(doc).map((f) => ({
    key: f.key,
    label: f.label,
    nodeId: f.nodeId,
    type: f.field.type,
    group: f.node.text || "Questions",
    required: !!f.field.required,
  }));
}

/**
 * Where a registrant can be in the process.
 *
 * Every box that is not a question is somewhere a person can sit — waiting
 * on a list, being reviewed, declined, attending. Questions are excluded
 * because answering one is not a state anybody is parked in, and limits
 * are constraints rather than places.
 */
export function processStages(doc: ChartDoc): { id: string; label: string; terminal: boolean }[] {
  const isStage = (n: FlowNode) => n.kind === "step" || n.kind === "decision" || n.kind === "end";
  const byId = new Map(doc.nodes.map((n) => [n.id, n]));

  // Walk the arrows so stages come out in the order they happen, not in
  // whatever order the array holds.
  const seen = new Set<string>();
  const order: string[] = [];
  const walk = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    const n = byId.get(id);
    if (n && isStage(n)) order.push(id);
    for (const e of doc.edges.filter((x) => x.from === id)) walk(e.to);
  };
  doc.nodes
    .filter((n) => n.kind === "start")
    .sort((a, b) => a.y - b.y)
    .forEach((n) => walk(n.id));
  doc.nodes
    .filter((n) => isStage(n) && !seen.has(n.id))
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .forEach((n) => walk(n.id));

  return order
    .map((id) => byId.get(id)!)
    .map((n) => ({ id: n.id, label: n.text || n.kind, terminal: n.kind === "end" }));
}

/** Questions that must be answered — the panel's "incomplete" filter. */
export function requiredKeys(doc: ChartDoc): string[] {
  return doc.nodes.flatMap((n) => fieldsOf(n).filter((f) => f.required).map((f) => f.key));
}

// ── the roster sheet ────────────────────────────────────────────────

export type SheetRef =
  | { ok: true; id: string; gid: string | null; url: string }
  | { ok: false; reason: string };

/**
 * Pull the document id out of a pasted Google Sheets link.
 *
 * People paste whatever the address bar had — with `/edit`, a `#gid=`,
 * sharing junk on the end — so parse rather than demanding a clean URL,
 * and say plainly what is wrong when it is not a Sheet at all.
 */
export function parseSheetUrl(raw: string): SheetRef {
  const url = raw.trim();
  if (!url) return { ok: false, reason: "Paste the link to the sheet." };

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, reason: "That is not a link." };
  }
  if (parsed.protocol !== "https:") {
    return { ok: false, reason: "The link needs to start with https." };
  }
  if (!/(^|\.)google\.com$/.test(parsed.hostname)) {
    return { ok: false, reason: "That is not a Google Sheets link." };
  }
  const id = parsed.pathname.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)?.[1];
  if (!id) {
    return { ok: false, reason: "That is a Google link, but not to a spreadsheet." };
  }
  const gid = parsed.hash.match(/gid=(\d+)/)?.[1] ?? parsed.searchParams.get("gid");
  return { ok: true, id, gid: gid ?? null, url };
}
