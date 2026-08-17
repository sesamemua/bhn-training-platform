/**
 * Flow chart document — the shape stored in FlowChart.data.
 *
 * Deliberately small: a node is a labelled box at a position, an edge is a
 * line between two nodes. Everything else (routing, arrowheads, layout) is
 * derived at render time, so the saved document stays readable and can be
 * hand-edited or diffed if it ever needs to be.
 */
import { z } from "zod";

/** What a box means. Shape follows kind — this is the only styling input. */
export const NODE_KINDS = ["step", "decision", "start", "end", "note"] as const;
export type NodeKind = (typeof NODE_KINDS)[number];

export const NODE_KIND_LABEL: Record<NodeKind, string> = {
  start: "Start",
  step: "Step",
  decision: "Decision",
  end: "End",
  note: "Note",
};

export const NodeSchema = z.object({
  id: z.string().min(1).max(40),
  x: z.number().min(-5000).max(10000),
  y: z.number().min(-5000).max(10000),
  w: z.number().min(60).max(600),
  h: z.number().min(36).max(400),
  kind: z.enum(NODE_KINDS),
  text: z.string().max(240),
  /** Who acts here — drawn as a small caption under the label. */
  actor: z.string().max(60).optional(),
});

export const EdgeSchema = z.object({
  id: z.string().min(1).max(40),
  from: z.string().min(1).max(40),
  to: z.string().min(1).max(40),
  /** Branch label, e.g. "yes" / "no" off a decision. */
  label: z.string().max(40).optional(),
});

export const ChartSchema = z.object({
  nodes: z.array(NodeSchema).max(120),
  edges: z.array(EdgeSchema).max(240),
});

export type FlowNode = z.infer<typeof NodeSchema>;
export type FlowEdge = z.infer<typeof EdgeSchema>;
export type ChartDoc = z.infer<typeof ChartSchema>;

/**
 * Parse a stored blob, dropping anything malformed rather than throwing —
 * a chart that lost one edge should still open, because an editor that
 * refuses to load is worse than one that loads slightly lossy.
 * Edges pointing at missing nodes are removed for the same reason.
 */
export function parseChart(raw: unknown): ChartDoc {
  const base = ChartSchema.safeParse(raw);
  if (base.success) return prune(base.data);

  const o = (raw ?? {}) as { nodes?: unknown; edges?: unknown };
  const nodes = Array.isArray(o.nodes)
    ? o.nodes.map((n) => NodeSchema.safeParse(n)).filter((r) => r.success).map((r) => r.data)
    : [];
  const edges = Array.isArray(o.edges)
    ? o.edges.map((e) => EdgeSchema.safeParse(e)).filter((r) => r.success).map((r) => r.data)
    : [];
  return prune({ nodes, edges });
}

function prune(doc: ChartDoc): ChartDoc {
  const ids = new Set(doc.nodes.map((n) => n.id));
  return { nodes: doc.nodes, edges: doc.edges.filter((e) => ids.has(e.from) && ids.has(e.to)) };
}

export const EMPTY_CHART: ChartDoc = { nodes: [], edges: [] };
