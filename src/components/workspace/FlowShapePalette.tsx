"use client";

/**
 * The shape palette: what each shape means, and where you get one.
 *
 * These used to be two separate things — a legend row above the chart
 * that explained the shapes but did nothing, and a tray of bare outlines
 * on the canvas you could drag from but which named nothing. Splitting
 * them meant the place that taught you the vocabulary was not the place
 * you reached for it. One panel now does both: every row is the shape,
 * its name, a description on hover, and a handle you can drag onto the
 * chart.
 *
 * It sits in the canvas's top-right corner and sticks there, so it is
 * within reach a thousand pixels down a long flow rather than back at the
 * top of the page.
 */
import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { NODE_KINDS, NODE_KIND_LABEL, type NodeKind } from "@/lib/flowchart/types";
import { DASHED_KINDS, SHAPE_PAINT, shapePath } from "@/lib/flowchart/shapes";

/**
 * Examples are drawn from the Training Week registration flow on purpose.
 * "A decision point" teaches less than "Any chosen session full?", which
 * the reader can go and look at on the chart in front of them.
 */
const MEANING: Record<NodeKind, { use: string; example: string }> = {
  start: {
    use: "Where the process begins. Usually one per flow.",
    example: "Registration opens",
  },
  question: {
    use: "Something the registrant answers. Every question here becomes a field in the live form.",
    example: "About you — name, position title, LinkedIn, category",
  },
  step: {
    use: "Something that happens, done by a person or by the system. No answer, no branch.",
    example: "Seat confirmed, info pack emailed",
  },
  decision: {
    use: "A fork. The arrows leaving it carry the answers, and a rule on each says when it is followed.",
    example: "Any chosen session full? → yes / no",
  },
  end: {
    use: "Where someone stops. A flow can have several — not every ending is a good one.",
    example: "Attends · Declined, with a reason",
  },
  note: {
    use: "A remark for whoever is reading the chart. Not part of the process, never reaches the form.",
    example: "Undecided: does the waitlist promote itself?",
  },
  rule: {
    use: "A constraint on a question: how many may be picked, and which options clash because they run at once.",
    example: "Up to 3 sessions · the two Tuesday 1 PM workshops clash",
  },
  document: {
    use: "Something produced and handed over — a letter, an email, a PDF.",
    example: "Info pack emailed to the registrant",
  },
  data: {
    use: "A list or record the process reads from or writes to.",
    example: "The eligibility sheet of 41 member institutions",
  },
  subprocess: {
    use: "A run of work defined somewhere else, folded into one box so this chart stays readable.",
    example: "Travel-support approval (its own process)",
  },
  delay: {
    use: "Waiting. Time passes here and nobody is doing anything.",
    example: "Wait for the confirmation cut-off",
  },
  manual: {
    use: "Something a person does by hand, off the platform.",
    example: "Programme lead checks a name against the sheet",
  },
  connector: {
    use: "A jump. Two connectors with the same label are the same point, for when a line would cross the whole chart.",
    example: "A — continues under the waitlist branch",
  },
};

export function FlowShapePalette({
  mime,
  active,
  onPick,
  onDragKind,
  onDragEnd,
}: {
  /** The drag payload type the canvas listens for. */
  mime: string;
  /** The kind a double-click would place — shown as selected. */
  active: NodeKind;
  onPick: (k: NodeKind) => void;
  onDragKind: (k: NodeKind) => void;
  onDragEnd: () => void;
}) {
  const [open, setOpen] = useState(true);

  return (
    <div className="w-[168px] rounded-lg border border-line bg-card/95 shadow-card-hover backdrop-blur">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-subtle hover:text-fg"
      >
        Shapes
        {open ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
      </button>

      {open && (
        <div className="px-1 pb-1.5">
          {NODE_KINDS.map((k) => (
            <div key={k} className="group relative">
              <button
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(mime, k);
                  e.dataTransfer.effectAllowed = "copy";
                  onDragKind(k);
                }}
                onDragEnd={onDragEnd}
                onClick={() => onPick(k)}
                className={`flex w-full cursor-grab items-center gap-2 rounded px-1.5 py-1 text-left transition-colors active:cursor-grabbing ${
                  active === k ? "bg-brand-500/20" : "hover:bg-elevated"
                }`}
              >
                <svg aria-hidden width="22" height="12" className="shrink-0 overflow-visible">
                  <path
                    d={shapePath(k, 22, 12)}
                    className={SHAPE_PAINT[k]}
                    strokeWidth="1"
                    strokeDasharray={DASHED_KINDS.includes(k) ? "3 2" : undefined}
                    fillRule="evenodd"
                  />
                </svg>
                <span className="truncate text-[11.5px] text-fg">{NODE_KIND_LABEL[k]}</span>
              </button>

              {/* Opens to the LEFT: the panel lives in the right-hand
                  corner, so anything opening rightward would be off the
                  canvas and clipped. */}
              <span
                role="tooltip"
                className="pointer-events-none absolute right-full top-0 z-40 mr-2 hidden w-60 rounded-md border border-line bg-card p-2.5 text-left shadow-card-hover group-hover:block"
              >
                <span className="block text-[11.5px] leading-relaxed text-fg">
                  {MEANING[k].use}
                </span>
                <span className="mt-1.5 block text-[11px] leading-relaxed text-subtle">
                  e.g. {MEANING[k].example}
                </span>
              </span>
            </div>
          ))}

          <p className="px-1.5 pt-1 text-[10px] leading-snug text-subtle">
            Drag one onto the chart, or double-click empty space.
          </p>
        </div>
      )}
    </div>
  );
}
