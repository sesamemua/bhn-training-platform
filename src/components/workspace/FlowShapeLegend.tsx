"use client";

/**
 * What each shape means, in one wrapped row.
 *
 * A flow chart's shapes are a vocabulary, and a vocabulary nobody was
 * taught is just decoration — the difference between a step and a
 * decision is obvious once someone says it and guessable-but-wrong until
 * then. Kept to a swatch and a word each, with the explanation and a real
 * example from this chart held back until hover, so the legend costs one
 * line of the page rather than a paragraph.
 *
 * The examples are drawn from the Training Week flow on purpose: an
 * abstract "a decision point" teaches less than "Any chosen session
 * full?", which the reader can go and look at.
 */
import { NODE_KINDS, NODE_KIND_LABEL, type NodeKind } from "@/lib/flowchart/types";
import { DASHED_KINDS, SHAPE_PAINT, shapePath } from "@/lib/flowchart/shapes";

/**
 * The swatch is the real outline at 22x12, so the legend cannot drift
 * from the canvas — both call shapePath.
 */
function Swatch({ kind }: { kind: NodeKind }) {
  return (
    <svg aria-hidden width="22" height="12" className="shrink-0 overflow-visible">
      <path
        d={shapePath(kind, 22, 12)}
        className={SHAPE_PAINT[kind]}
        strokeWidth="1"
        strokeDasharray={DASHED_KINDS.includes(kind) ? "3 2" : undefined}
        fillRule="evenodd"
      />
    </svg>
  );
}

const MEANING: Record<NodeKind, { use: string; example: string }> = {
  start: {
    use: "Where the process begins. One per flow, usually.",
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
    use: "A fork. The arrows leaving it carry the answers, and a rule on each one says when it is followed.",
    example: "Any chosen session full? → yes / no",
  },
  end: {
    use: "Where someone stops. A flow can have several — not every ending is a good one.",
    example: "Attends · Declined, with a reason",
  },
  note: {
    use: "A remark for whoever is reading the chart. Not part of the process and never reaches the form.",
    example: "Undecided: does the waitlist promote itself?",
  },
  rule: {
    use: "A constraint on a question: how many may be picked, and which options clash because they run at once.",
    example: "Up to 3 sessions · the two Tuesday 1 PM workshops clash",
  },
  document: {
    use: "Something produced and handed over — a letter, an email, a PDF. Drawing only; it does not change the form.",
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

export function FlowShapeLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-subtle">
        Shapes
      </span>
      {NODE_KINDS.map((k) => (
        <span key={k} className="group relative inline-flex items-center gap-1.5">
          <Swatch kind={k} />
          <span className="cursor-help text-[11.5px] text-muted group-hover:text-fg">
            {NODE_KIND_LABEL[k]}
          </span>

          {/* Held back until hover so the legend stays one line. Opens
              DOWNWARD: the legend sits near the top of the page, and
              above the row the panel was clipped off the viewport. It
              covers a corner of the chart for as long as the pointer
              rests here, which is the cheaper of the two costs. */}
          <span
            role="tooltip"
            className="pointer-events-none absolute left-0 top-full z-30 mt-2 hidden w-64 rounded-md border border-line bg-card p-2.5 text-left shadow-card-hover group-hover:block"
          >
            <span className="block text-[11.5px] leading-relaxed text-fg">
              {MEANING[k].use}
            </span>
            <span className="mt-1.5 block text-[11px] leading-relaxed text-subtle">
              e.g. {MEANING[k].example}
            </span>
          </span>
        </span>
      ))}
    </div>
  );
}
