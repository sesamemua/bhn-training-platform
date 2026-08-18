/**
 * The chart *is* the form.
 *
 * Question nodes become fields; arrows decide what comes next; an arrow
 * with a condition only fires when the answer matches. So a field is
 * shown when it is still reachable from a start node given the answers so
 * far — which means editing the chart edits the form, with no second
 * definition to keep in sync.
 *
 * Pure module: no React, no I/O. All the branching logic lives here so it
 * can be tested directly rather than through a rendered form.
 */
import type { ChartDoc, Condition, FlowNode } from "./types";
import { codedCompanyType, codedOrgName, codedOrgType, codedRole, isComplete, type Affiliation, type Contact, type OrgEntry } from "./vocab";

/** An answer is text, a set of choices, or a list of affiliations. */
export type AnswerValue = string | string[] | Affiliation[] | Contact | OrgEntry;
export type Answers = Record<string, AnswerValue>;

const isAffiliationList = (v: AnswerValue): v is Affiliation[] =>
  Array.isArray(v) && v.length > 0 && typeof v[0] === "object";

const isRecord = (v: AnswerValue): v is Contact | OrgEntry =>
  !!v && typeof v === "object" && !Array.isArray(v);

/**
 * Flatten any answer to the strings a condition can match against.
 *
 * For affiliations that means the coded organisation types AND roles, so
 * a rule can read "affiliation any of Teaching hospital" or "any of
 * Clinician" without the author needing to know how the entry is stored.
 */
const asArray = (v: AnswerValue | undefined): string[] => {
  if (v === undefined) return [];
  if (isAffiliationList(v)) {
    return v
      .filter(isComplete)
      .flatMap((a) => [codedOrgType(a), codedRole(a), a.organisation.trim()])
      .filter(Boolean);
  }
  if (isRecord(v)) {
    // A contact or a single organisation flattens to the values a rule
    // could sensibly test: the org name, its company type, the role.
    const o = v as Partial<OrgEntry> & Partial<Contact>;
    return [
      o.name ? codedOrgName(o as OrgEntry) : "",
      o.companyType ? codedCompanyType(o as OrgEntry) : "",
      o.role ?? "",
      o.email ?? "",
    ].filter(Boolean) as string[];
  }
  if (Array.isArray(v)) return v as string[];
  return v === "" ? [] : [v];
};

const norm = (s: string) => s.trim().toLowerCase();

/** Does one answer satisfy one condition? */
export function testCondition(c: Condition, answers: Answers): boolean {
  const got = asArray(answers[c.field]);
  const want = (c.value ?? "").split(",").map(norm).filter(Boolean);

  switch (c.op) {
    case "answered":
      return got.length > 0;
    case "empty":
      return got.length === 0;
    case "is":
      return got.length > 0 && want.length > 0 && norm(got[0]) === want[0];
    case "is not":
      return got.length === 0 || want.length === 0 || norm(got[0]) !== want[0];
    case "any of":
      return got.some((g) => want.includes(norm(g)));
    default:
      return true;
  }
}

/**
 * Every node reachable from a start node under the current answers.
 *
 * A node with NO incoming edges is treated as reachable: a chart people
 * are still drawing is full of orphans, and hiding them would make the
 * form appear to lose fields while it is being built.
 */
export function reachable(doc: ChartDoc, answers: Answers): Set<string> {
  const roots = rootsOf(doc);
  const seen = new Set<string>();
  const queue = roots.map((n) => n.id);

  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const e of doc.edges) {
      if (e.from !== id) continue;
      if (e.when && !testCondition(e.when, answers)) continue;
      if (!seen.has(e.to)) queue.push(e.to);
    }
  }
  return seen;
}

export interface DerivedField {
  nodeId: string;
  /** Position within its box's questions — what the options rail edits. */
  index: number;
  key: string;
  label: string;
  /** The specific field, since a node may carry several. */
  field: import("./types").FieldDef;
  /** Set on the first field of a multi-field box — the box's own title. */
  groupTitle?: string;
  node: FlowNode;
}

/** "position_title" → "Position title", for fields inside a group. */
function labelFor(key: string): string {
  const t = key.replace(/_/g, " ").trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/**
 * The fields, in the order a person meets them.
 *
 * Order follows the arrows from the start; anything the walk misses is
 * appended in visual order (top to bottom, then left to right), so a
 * half-drawn chart still produces a sensible form.
 */
/** Every field a question node carries — `fields[]` first, else `field`. */
export function fieldsOf(n: FlowNode) {
  if (n.fields?.length) return n.fields;
  return n.field ? [n.field] : [];
}

export function orderedFields(doc: ChartDoc): DerivedField[] {
  const questions = doc.nodes.filter((n) => n.kind === "question" && fieldsOf(n).length > 0);
  const byId = new Map(questions.map((n) => [n.id, n]));

  const order: string[] = [];
  const seen = new Set<string>();
  // Roots are walked top-to-bottom so a chart with several disconnected
  // starts reads down the page rather than in whatever order the array
  // happens to hold.
  const roots = rootsOf(doc).sort((a, b) => a.y - b.y || a.x - b.x);

  // Depth-first along the arrows, ignoring conditions: this is the
  // authoring order, not the runtime path.
  const walk = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    if (byId.has(id)) order.push(id);
    for (const e of doc.edges.filter((x) => x.from === id)) walk(e.to);
  };
  roots.forEach((r) => walk(r.id));

  const missed = questions
    .filter((q) => !order.includes(q.id))
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map((q) => q.id);

  return [...order, ...missed]
    .map((id) => byId.get(id))
    .filter((n): n is FlowNode => !!n)
    .flatMap((n) =>
      fieldsOf(n).map((fd, i) => ({
        nodeId: n.id,
        index: i,
        key: fd.key,
        // A single-field box is titled by the box; a group titles each
        // field by its own key so the form does not repeat one heading.
        label: fieldsOf(n).length === 1 ? n.text || fd.key : labelFor(fd.key),
        field: fd,
        groupTitle: fieldsOf(n).length > 1 && i === 0 ? n.text : undefined,
        node: n,
      })),
    );
}

/** The fields actually shown right now, given the answers so far. */
export function visibleFields(doc: ChartDoc, answers: Answers): DerivedField[] {
  const live = reachable(doc, answers);
  return orderedFields(doc).filter((f) => live.has(f.nodeId));
}

/** Required-and-empty fields among those currently shown. */
export function missingRequired(doc: ChartDoc, answers: Answers): DerivedField[] {
  return visibleFields(doc, answers).filter(
    (f) => f.field.required && asArray(answers[f.key]).length === 0,
  );
}

/**
 * Where a walk of the chart begins: explicit start boxes, plus anything
 * nothing points at. A chart that is nothing but a cycle has neither, so
 * every node becomes a root — otherwise the form would silently render
 * empty on a graph that is merely unusual rather than broken.
 */
function rootsOf(doc: ChartDoc): FlowNode[] {
  const hasIncoming = new Set(doc.edges.map((e) => e.to));
  const roots = doc.nodes.filter((n) => n.kind === "start" || !hasIncoming.has(n.id));
  return roots.length ? roots : doc.nodes;
}

/** A key that is unique in the chart, derived from the question text. */
export function suggestKey(text: string, taken: string[]): string {
  const base =
    text.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 30) || "field";
  if (!taken.includes(base)) return base;
  for (let i = 2; i < 100; i++) if (!taken.includes(`${base}_${i}`)) return `${base}_${i}`;
  return `${base}_${Date.now().toString(36).slice(-3)}`;
}
