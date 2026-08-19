/**
 * Reading a box's words and saying what shape it looks like.
 *
 * The shape vocabulary is the useful part of a flow chart and the part
 * nobody remembers: most people draw everything as a rectangle because
 * choosing between thirteen outlines is work they did not come here to
 * do. So the chart reads along and offers — a suggestion beside the
 * field being typed into, one click to take it, dismissed and it stays
 * dismissed.
 *
 * Deliberately rules rather than a model. Three reasons, in order: it
 * has to answer on every keystroke, so it must be instant and free; a
 * suggestion the author can predict is one they learn the vocabulary
 * from, where an oracle is just something else to argue with; and it
 * can say WHY in words that are true, because the reason is the rule
 * that fired rather than a story told after the fact.
 *
 * The bar for speaking is high on purpose. A suggester that is wrong a
 * third of the time is worse than none, because it costs a decision
 * every time it appears. Anything these rules cannot place confidently
 * returns null and says nothing.
 */
import type { NodeKind } from "./types";

export interface Suggestion {
  kind: NodeKind;
  /** Why, in the author's language — shown under the suggestion. */
  why: string;
}

/** Words that mean the sentence is addressed TO the registrant. */
const SECOND_PERSON = /\b(you|your|yours)\b/i;

/**
 * The first clause of a label.
 *
 * A label joining two clauses with a comma — "Seat confirmed, info pack
 * emailed" — is describing a run of things happening, which is a step,
 * however document-shaped the tail sounds. The rules that name a THING
 * (document, stored data) therefore only read the head, so the artifact
 * has to be what the box is about rather than something it mentions on
 * the way past.
 */
const head = (t: string) => t.split(/,\s+/)[0];

/**
 * A rule reads the label and the actor SEPARATELY.
 *
 * They were once concatenated into one string, which quietly broke every
 * rule anchored to the end of the line: "Registration opens" is a start,
 * but the seed gives that box the actor "Coordinator", so the rule was
 * matching against "Registration opens Coordinator" and the $ never hit.
 * Only the rules that genuinely want the actor should see it.
 */
interface Rule {
  kind: NodeKind;
  why: string;
  test: (text: string, actor: string) => boolean;
}

/**
 * First match wins, so the order is the design.
 *
 * Narrow, unmistakable readings come first — a line that opens "Note:"
 * is a note whatever else it says. The broad ones come last, where they
 * can only catch what nothing sharper claimed.
 */
const RULES: Rule[] = [
  {
    kind: "note",
    why: "it is a remark to the reader rather than a step",
    test: (t) => /^(note|nb|fyi|todo|tbd|undecided|open question|question for)\b/i.test(t)
      || /^\(.*\)$/.test(t.trim()),
  },
  {
    kind: "connector",
    why: "it points somewhere else in the chart rather than doing anything",
    test: (t) => /^[A-Z]$/.test(t.trim())
      || /^(continues?|continued|carries on|goes to|jump to|see also|off-page|resumes?)\b/i.test(t),
  },
  {
    kind: "subprocess",
    why: "it stands in for a run of work defined somewhere else",
    test: (t) => /\b(sub-?process|its own process|separate process|defined elsewhere|handled elsewhere|own workflow|see the .{0,30}(process|chart|flow))\b/i.test(t),
  },
  {
    kind: "delay",
    why: "time passes here and nobody is doing anything",
    test: (t) => /\b(wait|waits|waiting|hold until|on hold|pending|cut-?off|deadline|until the|sleep|cooling.off)\b/i.test(t),
  },
  {
    kind: "rule",
    why: "it constrains an answer rather than asking for one",
    test: (t) => /\b(max|maximum|at most|no more than|up to \d|only one|only \d|limit(ed)?|cannot|can't|must not|clash(es)?|conflict|concurrent|mutually exclusive)\b/i.test(t),
  },
  {
    kind: "data",
    why: "it names a list or record the process reads from or writes to",
    // A record only makes the box a data box when the box IS the record.
    // "Checked against the eligibility sheet" is a step that consults one
    // — the sheet is the object of a preposition, not the subject — and
    // suggesting "stored data" there would be telling the author their
    // action is a noun.
    test: (t) => /\b(sheet|spreadsheet|database|roster|register|directory|the record|records|log of|master list|list of \d)\b/i.test(head(t))
      && !/\b(against|from|in|into|on|onto|to|with|via|per|using)\s+(the\s+|a\s+|our\s+)?(\w+\s+){0,2}(sheet|spreadsheet|database|roster|register|directory|record|records|list)\b/i.test(t),
  },
  {
    kind: "document",
    why: "it names something produced and handed over",
    test: (t) => /\b(emailed|e-?mail(s|ed)? (out|to)|letter|pdf|info pack|welcome pack|certificate|receipt|invoice|invitation|invite sent|confirmation (email|letter)|report (sent|issued))\b/i.test(head(t)),
  },
  {
    kind: "manual",
    why: "a person does this by hand, off the platform",
    // The only rule that reads the actor: "Programme lead" beside
    // "phones the registrant" is what makes it manual rather than
    // something the platform does.
    test: (t, actor) => /\b(by hand|manually|off-?platform|in person|phones?|calls? them)\b/i.test(t)
      || (/\b(lead|coordinator|officer|staff|administrator|organiser|organizer)\b/i.test(actor)
        && /\b(phones?|calls?|posts?|signs?|stamps?|files?)\b/i.test(t)),
  },
  {
    kind: "decision",
    why: "it is a fork the process evaluates, not something the registrant answers",
    test: (t) => t.trim().endsWith("?")
      && !SECOND_PERSON.test(t)
      && /\b(any|all|does|do|is|are|was|were|has|have|had|can|should|already|full|eligible|approved|valid|exists?|match(es)?|over|under|more than|fewer than)\b/i.test(t),
  },
  {
    kind: "question",
    why: "the registrant answers this, so it becomes a field in the form",
    test: (t) => (t.trim().endsWith("?") && SECOND_PERSON.test(t))
      || /^(what|which|when|where|who|how many|how much|tell us|choose|pick|select|enter|upload)\b/i.test(t)
      || /^(your|about you)\b/i.test(t),
  },
  {
    kind: "start",
    why: "it is where the process begins",
    test: (t) => /^(start|begins?|opens?|kick-?off)\b/i.test(t)
      || /\b(opens|registration opens|goes live)$/i.test(t.trim()),
  },
  {
    kind: "end",
    why: "it is somewhere a person stops",
    test: (t) => /^(end|ends|done|finished|complete[d]?|closed)\b/i.test(t)
      || /\b(attends|declined|withdrawn|withdraws|cancelled|canceled|no seat|does not attend|drops out)\b/i.test(t),
  },
];

/**
 * What shape these words look like, or null when nothing is sure enough
 * to be worth interrupting for.
 *
 * `actor` counts as part of the sentence: "Programme lead" beside
 * "checks the eligibility sheet" is what makes it a manual step rather
 * than a system one.
 */
export function suggestKind(text: string, actor?: string): Suggestion | null {
  const t = (text ?? "").trim();
  const who = (actor ?? "").trim();
  // Too short to read. Two or three characters is someone mid-word, and
  // suggesting a shape at that point is guessing at them, not reading.
  if (t.replace(/\s+/g, "").length < 4) return null;

  for (const r of RULES) {
    if (r.test(t, who)) return { kind: r.kind, why: r.why };
  }
  return null;
}

/**
 * The suggestion worth SHOWING for a box: none when it already is what
 * it should be, and none for a box whose shape is doing a job the words
 * cannot see.
 *
 * A question box that has grown form fields is the case that matters. By
 * then the shape is load-bearing — changing it would drop the fields —
 * so the words no longer get a vote.
 */
export function suggestionFor(
  node: { text: string; actor?: string | null; kind: NodeKind },
  fieldCount = 0,
): Suggestion | null {
  if (node.kind === "question" && fieldCount > 0) return null;
  const s = suggestKind(node.text, node.actor ?? undefined);
  return s && s.kind !== node.kind ? s : null;
}
