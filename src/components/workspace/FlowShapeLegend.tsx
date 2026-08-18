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

/** The swatch styling, matching how the canvas draws each kind. */
const SWATCH: Record<NodeKind, string> = {
  start: "rounded-full border-brand-400/70 bg-brand-500/12",
  question: "rounded-[3px] border-brand-400/70 bg-brand-500/8",
  step: "rounded-[3px] border-line-strong bg-elevated",
  decision: "rounded-[3px] border-amber-500/60 bg-amber-500/10",
  end: "rounded-full border-line-strong bg-elevated",
  note: "rounded-[3px] border-dashed border-line-strong bg-transparent",
  rule: "rounded-[3px] border-dashed border-amber-500/60 bg-amber-500/8",
};

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
};

export function FlowShapeLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-subtle">
        Shapes
      </span>
      {NODE_KINDS.map((k) => (
        <span key={k} className="group relative inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className={`inline-block h-2.5 w-4 shrink-0 border ${SWATCH[k]}`}
          />
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
