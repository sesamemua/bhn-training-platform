/**
 * Brain Picker — the rules behind asking a colleague for something and
 * giving them nothing back.
 *
 *   brain picker (n.) — someone who frequently asks for free advice,
 *   ideas, or informal consulting without offering to compensate you or
 *   provide anything of value in return.
 *
 * Pure: no Prisma import, so the page, the API and the tests all read
 * the same rules. The caller does the counting; this decides what the
 * numbers mean and what to say about them.
 *
 * One design rule runs through the whole file: **the joke is on the
 * asker.** Every line of copy here needles whoever is doing the picking.
 * Nothing rates, ranks or mocks the person being asked — they are real
 * colleagues who will open this page, and the fastest way to make a
 * funny internal tool unusable is to make somebody the punchline.
 */

export type PickKind = "question" | "task" | "favour";
export type PickStatus = "open" | "answered" | "declined";

export const PICK_KINDS: readonly PickKind[] = ["question", "task", "favour"];
export const PICK_STATUSES: readonly PickStatus[] = ["open", "answered", "declined"];

/** What "offering nothing" looks like when nobody typed anything. */
export const NOTHING = "nothing";

export const KIND_LABEL: Record<PickKind, string> = {
  question: "A question",
  task: "A task",
  favour: "A favour",
};

// ── Specialities ──────────────────────────────────────────────────────
// Drafted, not researched. Every card is editable, and one with no
// BrainProfile row behind it is marked as a guess on the page — being
// wrong out loud is fine, being wrong silently is not.

export interface DraftedSpeciality {
  speciality: string;
  rate: string;
}

/** Keyed by email, because names change and ids differ per environment. */
export const DRAFTED_SPECIALITIES: Record<string, DraftedSpeciality> = {
  "ruilin.yuan@utoronto.ca": {
    speciality: "The platform itself — and why the thing you are looking at looks like that.",
    rate: "Already paid in scope creep",
  },
  "a.stirling@utoronto.ca": {
    speciality: "EQUIP and the funding streams. If it involves VentureConnect money, it involves Alison.",
    rate: "Free, apparently",
  },
  "meena.venkatesan@utoronto.ca": {
    speciality: "Training content and the people going through it.",
    rate: "Free, apparently",
  },
  "epshita.islam@utoronto.ca": {
    speciality: "Events, and what a room can actually hold once you put chairs in it.",
    rate: "Free, apparently",
  },
  "yes.lee@utoronto.ca": {
    speciality: "How a thing looks before it goes out, and whether it should.",
    rate: "Free, apparently",
  },
  "roshni.christo@utoronto.ca": {
    speciality: "Comms and the newsletter — what we sound like in public.",
    rate: "Free, apparently",
  },
  "yoojin.park@utoronto.ca": {
    speciality: "Partners, and the people on the other end of them.",
    rate: "Free, apparently",
  },
};

export const FALLBACK_SPECIALITY: DraftedSpeciality = {
  speciality: "Unknown. Which has never stopped anybody asking.",
  rate: "Free, apparently",
};

export function draftedFor(email: string): DraftedSpeciality {
  return DRAFTED_SPECIALITIES[email.trim().toLowerCase()] ?? FALLBACK_SPECIALITY;
}

// ── The audacity meter ────────────────────────────────────────────────

export interface AskerStats {
  /** Asks you have sent. */
  sent: number;
  /** Of those, how many came with an offer of something. */
  promised: number;
  /** How many of those you actually delivered. Nothing on this page can
   *  record a delivery, so it is always 0. That is not a bug; it is the
   *  most accurate number here. */
  delivered: number;
  /** How many times somebody has asked YOU for something. */
  received: number;
}

export interface Audacity {
  /** 0–100. Rises with asking, falls with being asked and delivering. */
  score: number;
  label: string;
  /** One line, addressed to the person reading it. */
  verdict: string;
}

const LABELS: { min: number; label: string }[] = [
  { min: 90, label: "You are the reason this page exists" },
  { min: 70, label: "Insatiable" },
  { min: 45, label: "Audacious" },
  { min: 20, label: "Cheeky" },
  { min: 0, label: "Reasonable" },
];

/**
 * How much cheek you are running on.
 *
 * Asking costs you points. Being asked earns them back, because a brain
 * that gets picked is a brain that is worth picking. Actually delivering
 * on something you promised earns the most — which is why nobody's score
 * ever goes down.
 */
export function audacity(stats: AskerStats): Audacity {
  const owed = Math.max(0, stats.promised - stats.delivered);
  const raw = stats.sent * 9 + owed * 11 - stats.received * 6 - stats.delivered * 14;
  const score = Math.max(0, Math.min(100, Math.round(raw)));
  const label = LABELS.find((l) => score >= l.min)?.label ?? "Reasonable";

  let verdict: string;
  if (stats.sent === 0) {
    verdict = "You have not picked anybody's brain yet. Enjoy this moment of moral clarity.";
  } else if (owed === 0 && stats.promised === 0) {
    verdict = `${plural(stats.sent, "ask")}, nothing offered in return. At least you are honest about it.`;
  } else if (stats.delivered === 0) {
    verdict = `You have promised ${plural(owed, "thing")} and delivered none of them. This page keeps count so you do not have to.`;
  } else {
    verdict = `${plural(owed, "promise")} still outstanding.`;
  }
  return { score, label, verdict };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The promised-versus-delivered tally, in the page's own words. */
export function ledger(stats: AskerStats): string {
  if (stats.sent === 0) return "Nothing promised. Nothing owed. Nothing asked.";
  const owed = Math.max(0, stats.promised - stats.delivered);
  if (stats.promised === 0) {
    return `${plural(stats.sent, "brain")} picked. Nothing offered in return, not even notionally.`;
  }
  return (
    `${plural(stats.sent, "brain")} picked · ${plural(stats.promised, "thing")} promised · ` +
    `${stats.delivered} delivered · ${owed} outstanding`
  );
}

/** The line about how often anybody picks yours. */
export function reciprocity(stats: AskerStats): string {
  if (stats.received === 0 && stats.sent === 0) return "Nobody has asked you anything either. A quiet equilibrium.";
  if (stats.received === 0) {
    return "Your own brain has been picked zero times, which is either a compliment or an oversight.";
  }
  if (stats.received >= stats.sent) {
    return `Your brain has been picked ${plural(stats.received, "time")} — more than you have picked anybody else's. You are, technically, the victim here.`;
  }
  return `Your brain has been picked ${plural(stats.received, "time")}. The balance of trade is not in their favour.`;
}

// ── Probes: what they said, against what they did ─────────────────────

export interface Probe {
  /** What the check is, in a person's words. */
  label: string;
  /** Turns a raw count into a verdict on the asked person's follow-through. */
  verdict: (count: number, status: PickStatus, firstName: string) => string;
}

/**
 * A probe is the only honest thing on a page built out of favours: it
 * measures whether the thing was actually done, rather than whether
 * somebody said they would do it.
 *
 * The count comes from the caller (a MerchPick count, in the one case
 * that exists today), so this file stays free of the database.
 */
export const PROBES: Record<string, Probe> = {
  "merch-starred": {
    label: "Has starred something on the merch board",
    verdict: (count, status, firstName) => {
      if (count > 0) {
        return `${firstName} has starred ${plural(count, "item")}. Genuinely helped. Consider the coffee.`;
      }
      if (status === "answered") return `${firstName} says it is done. ${firstName} has starred nothing.`;
      if (status === "declined") return `${firstName} declined, and starred nothing. Consistent, at least.`;
      return `${firstName} has starred nothing so far.`;
    },
  },
};

export function probeVerdict(
  probe: string | null | undefined,
  count: number,
  status: PickStatus,
  firstName: string,
): string | null {
  if (!probe) return null;
  return PROBES[probe]?.verdict(count, status, firstName) ?? null;
}

/** First name only — the verdicts read as a sentence about a person. */
export function firstNameOf(name: string | null | undefined, fallback = "They"): string {
  const first = (name ?? "").trim().split(/\s+/)[0];
  return first || fallback;
}

/** Initials for the avatar, since nobody on the platform has a photo. */
export function initialsOf(name: string | null | undefined, email = ""): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (email.trim()[0] ?? "?").toUpperCase();
}

// ── The first task ────────────────────────────────────────────────────

/** Pre-loaded so the first brain pick is one click, not a blank form. */
export const MERCH_BRIEF = {
  subject: "Merch: which of these would you actually take home?",
  body:
    "We are picking trade-show giveaways and I would rather not choose them alone.\n\n" +
    "Open the merch board and star anything you would genuinely take home from a booth. " +
    "Ignore the tiers and the pricing — that part is handled. I want the gut reaction: " +
    "would you carry it out of the venue, or leave it on the table?\n\n" +
    "Two minutes, tops. Set aside anything you think is a mistake.",
  href: "/admin/workspace/merch",
  kind: "task" as PickKind,
  probe: "merch-starred",
  bribe: "a coffee, eventually",
};
