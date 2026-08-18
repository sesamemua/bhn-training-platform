import assert from "node:assert/strict";
import test from "node:test";
import { labelSize, placeLabels, type Rect } from "../../src/lib/flowchart/labels";
import { routeEdge } from "../../src/lib/flowchart/route";
import { TRAINING_WEEK_FLOW } from "../../src/lib/flowchart/seed";
import type { ChartDoc, FlowNode } from "../../src/lib/flowchart/types";

const BOX_PAD = 6;

/** The same canvas size the editor computes: content, or the pane if wider. */
function boundsFor(doc: ChartDoc, paneW: number) {
  const content = Math.max(620, ...doc.nodes.map((n) => n.x + n.w + 60));
  return {
    w: Math.max(content, paneW),
    h: Math.max(560, ...doc.nodes.map((n) => n.y + n.h + 60)),
  };
}
const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

/** Lay out every labelled arrow on a chart, the way the editor does. */
function layout(doc: ChartDoc, bounds = boundsFor(TRAINING_WEEK_FLOW, 944)) {
  const byId = new Map(doc.nodes.map((n) => [n.id, n]));
  const laid = doc.edges.flatMap((e) => {
    const a = byId.get(e.from), b = byId.get(e.to);
    if (!a || !b) return [];
    const text = e.label ?? (e.when ? `${e.when.field} ${e.when.op}` : "");
    if (!text) return [];
    return [{ e, points: routeEdge(a, b, doc.nodes), text }];
  });
  const spots = placeLabels(laid.map((l) => ({ points: l.points, text: l.text })), doc.nodes, bounds);
  return laid.map((l, i) => {
    const size = labelSize(l.text);
    return {
      ...l,
      rect: { x: spots[i].x - size.w / 2, y: spots[i].y - size.h / 2, ...size } as Rect,
      spot: spots[i],
    };
  });
}

const boxRect = (n: FlowNode): Rect => ({
  x: n.x - BOX_PAD, y: n.y - BOX_PAD, w: n.w + BOX_PAD * 2, h: n.h + BOX_PAD * 2,
});

test("no arrow label lands on top of a box in the seeded chart", () => {
  for (const l of layout(TRAINING_WEEK_FLOW)) {
    for (const n of TRAINING_WEEK_FLOW.nodes) {
      assert.ok(
        !overlaps(l.rect, boxRect(n)),
        `label "${l.text}" covers the box "${n.text}"`,
      );
    }
  }
});

test("two labels never sit on the same spot", () => {
  const laid = layout(TRAINING_WEEK_FLOW);
  for (let i = 0; i < laid.length; i++) {
    for (let j = i + 1; j < laid.length; j++) {
      assert.ok(
        !overlaps(laid[i].rect, laid[j].rect),
        `labels "${laid[i].text}" and "${laid[j].text}" overlap`,
      );
    }
  }
});

test("a label stays on the canvas", () => {
  const bounds = boundsFor(TRAINING_WEEK_FLOW, 944);
  for (const l of layout(TRAINING_WEEK_FLOW, bounds)) {
    assert.ok(l.rect.x >= 0, `"${l.text}" is off the left edge`);
    assert.ok(l.rect.y >= 0, `"${l.text}" is off the top edge`);
    assert.ok(l.rect.x + l.rect.w <= bounds.w, `"${l.text}" is off the right edge`);
    assert.ok(l.rect.y + l.rect.h <= bounds.h, `"${l.text}" is off the bottom edge`);
  }
});

test("a blocked label moves out to the side rather than staying put", () => {
  // Two boxes stacked with barely a gap: the midpoint nudge would land
  // the label on the lower box, so it has to go out to a margin.
  const doc: ChartDoc = {
    nodes: [
      { id: "a", kind: "step", x: 300, y: 0, w: 250, h: 60, text: "top" },
      { id: "b", kind: "step", x: 300, y: 110, w: 250, h: 60, text: "bottom" },
      { id: "c", kind: "step", x: 300, y: 40, w: 250, h: 90, text: "in the way" },
    ],
    edges: [{ id: "e", from: "a", to: "b", label: "a long branch label" }],
  };
  const [l] = layout(doc, { w: 1200, h: 400 });
  for (const n of doc.nodes) {
    assert.ok(!overlaps(l.rect, boxRect(n)), `label covers "${n.text}"`);
  }
  const away = Math.hypot(l.spot.x - l.spot.anchorX, l.spot.y - l.spot.anchorY);
  assert.ok(away > 12, "a blocked label should move further than the first nudge");
});

test("an unobstructed label stays close to its line", () => {
  const doc: ChartDoc = {
    nodes: [
      { id: "a", kind: "step", x: 400, y: 0, w: 200, h: 50, text: "top" },
      { id: "b", kind: "step", x: 400, y: 400, w: 200, h: 50, text: "bottom" },
    ],
    edges: [{ id: "e", from: "a", to: "b", label: "yes" }],
  };
  const [l] = layout(doc, { w: 1200, h: 600 });
  const away = Math.hypot(l.spot.x - l.spot.anchorX, l.spot.y - l.spot.anchorY);
  assert.equal(away, 12, "with nothing in the way, the first nudge should win");
  assert.ok(l.spot.clear, "it should report a clear placement");
});

test("a narrow pane still keeps every label on the canvas", () => {
  // Below the xl breakpoint the pane is narrower than the chart, so the
  // side margins the placer likes to use are gone. It may then have to
  // settle for a crowded spot — but never for one nobody can see.
  const bounds = boundsFor(TRAINING_WEEK_FLOW, 400);
  for (const l of layout(TRAINING_WEEK_FLOW, bounds)) {
    assert.ok(l.rect.x >= 0 && l.rect.x + l.rect.w <= bounds.w, `"${l.text}" is off the canvas`);
    assert.ok(l.rect.y >= 0 && l.rect.y + l.rect.h <= bounds.h, `"${l.text}" is off the canvas`);
  }
});
