/**
 * The outline of each kind of box, as an SVG path.
 *
 * Drawn rather than styled with CSS because half of these are not
 * rectangles, and `clip-path` on a bordered div throws the border away
 * exactly where the shape stops being square — a clipped diamond loses
 * all four of its edges. A path keeps a crisp stroke on any outline, and
 * lets the selected state simply thicken that stroke instead of ringing a
 * rectangle around a shape that is not one.
 *
 * On the classic set: ISO 5807 draws a decision as a true diamond. A
 * diamond wastes most of its area — text can only use the middle band —
 * and these boxes carry real sentences, so decisions are drawn as a
 * chamfered hexagon: the same "this is where it forks" reading at about
 * twice the usable width. Everything else follows the standard.
 */
import type { NodeKind } from "./types";

/** How much horizontal room the outline takes away from the text. */
export const SHAPE_INSET: Partial<Record<NodeKind, number>> = {
  question: 12,   // parallelogram slant
  decision: 14,   // hexagon chamfer
  manual: 12,     // trapezoid slope
  delay: 10,      // the rounded end
  connector: 8,
  subprocess: 8,  // the two side bars
};

const r = (n: number) => Math.round(n * 10) / 10;

/**
 * The outline for one box at a given size. Origin is the top-left of the
 * box, so the caller can drop it straight into an overlay SVG.
 */
export function shapePath(kind: NodeKind, w: number, h: number): string {
  const W = Math.max(1, w);
  const H = Math.max(1, h);

  switch (kind) {
    // Terminator — a stadium. Start and end read as the same shape on
    // purpose; the colour is what separates them.
    case "start":
    case "end": {
      const rad = Math.min(H / 2, W / 2);
      return `M ${rad} 0 H ${r(W - rad)} A ${rad} ${rad} 0 0 1 ${r(W - rad)} ${H}`
        + ` H ${rad} A ${rad} ${rad} 0 0 1 ${rad} 0 Z`;
    }

    // Input / output — a parallelogram.
    case "question": {
      const s = Math.min(14, W / 6);
      return `M ${s} 0 H ${W} L ${r(W - s)} ${H} H 0 Z`;
    }

    // Decision — chamfered hexagon; see the note at the top of the file.
    case "decision": {
      const c = Math.min(16, W / 6);
      return `M ${c} 0 H ${r(W - c)} L ${W} ${r(H / 2)} L ${r(W - c)} ${H}`
        + ` H ${c} L 0 ${r(H / 2)} Z`;
    }

    // Document — flat top, one wave along the bottom.
    case "document": {
      const wave = Math.min(12, H / 4);
      return `M 0 0 H ${W} V ${r(H - wave)}`
        + ` C ${r(W * 0.75)} ${H} ${r(W * 0.25)} ${r(H - wave * 2)} 0 ${r(H - wave)} Z`;
    }

    // Stored data — a cylinder seen from the side.
    case "data": {
      const ry = Math.min(10, H / 5);
      return `M 0 ${ry} A ${r(W / 2)} ${ry} 0 0 1 ${W} ${ry} V ${r(H - ry)}`
        + ` A ${r(W / 2)} ${ry} 0 0 1 0 ${r(H - ry)} Z`;
    }

    // Predefined process — a rectangle with a rail down each side.
    case "subprocess": {
      const b = Math.min(10, W / 12);
      return `M 0 0 H ${W} V ${H} H 0 Z M ${b} 0 V ${H} M ${r(W - b)} 0 V ${H}`;
    }

    // Delay — flat on the left, a half-round on the right.
    case "delay": {
      const rad = Math.min(H / 2, W / 3);
      return `M 0 0 H ${r(W - rad)} A ${rad} ${rad} 0 0 1 ${r(W - rad)} ${H} H 0 Z`;
    }

    // Manual operation — a trapezoid, wider at the top.
    case "manual": {
      const s = Math.min(14, W / 8);
      return `M 0 0 H ${W} L ${r(W - s)} ${H} H ${s} Z`;
    }

    // On-page connector — a circle, for jumping somewhere else.
    case "connector": {
      const rad = Math.min(W, H) / 2;
      const cx = W / 2;
      const cy = H / 2;
      return `M ${r(cx - rad)} ${cy} A ${rad} ${rad} 0 1 0 ${r(cx + rad)} ${cy}`
        + ` A ${rad} ${rad} 0 1 0 ${r(cx - rad)} ${cy} Z`;
    }

    // Process, note and limit are all rectangles; what separates them is
    // the stroke, which the caller supplies.
    default: {
      const rad = 6;
      return `M ${rad} 0 H ${r(W - rad)} A ${rad} ${rad} 0 0 1 ${W} ${rad}`
        + ` V ${r(H - rad)} A ${rad} ${rad} 0 0 1 ${r(W - rad)} ${H}`
        + ` H ${rad} A ${rad} ${rad} 0 0 1 0 ${r(H - rad)}`
        + ` V ${rad} A ${rad} ${rad} 0 0 1 ${rad} 0 Z`;
    }
  }
}

/** Fill and stroke for each kind, as Tailwind classes on the path. */
export const SHAPE_PAINT: Record<NodeKind, string> = {
  start: "fill-brand-500/12 stroke-brand-400/70",
  end: "fill-elevated stroke-line-strong",
  question: "fill-brand-500/8 stroke-brand-400/70",
  step: "fill-elevated stroke-line-strong",
  decision: "fill-amber-500/10 stroke-amber-500/60",
  note: "fill-transparent stroke-line-strong",
  rule: "fill-amber-500/8 stroke-amber-500/60",
  document: "fill-elevated stroke-line-strong",
  data: "fill-elevated stroke-line-strong",
  subprocess: "fill-elevated stroke-line-strong",
  delay: "fill-elevated stroke-line-strong",
  manual: "fill-elevated stroke-line-strong",
  connector: "fill-brand-500/12 stroke-brand-400/70",
};

/** Kinds drawn with a dashed outline — advisory rather than performed. */
export const DASHED_KINDS: NodeKind[] = ["note", "rule"];
