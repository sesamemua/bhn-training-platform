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
// Taken from BioHubNet's own About Us page (biohubnet.ca/about-us),
// which publishes the team's titles. Job titles, not personality
// readings: the page needs to know what somebody is responsible for so
// you know who to interrupt, and nothing more than that.
//
// Anyone the public site does not list keeps `source: null` and the card
// says the line is still a guess. Every card is editable either way —
// a title is what an organisation says you do, which is not always what
// you actually do.

export interface DraftedSpeciality {
  speciality: string;
  rate: string;
  /** Where the line came from. Null = nobody has looked it up. */
  source: string | null;
}

const BHN = "biohubnet.ca/about-us";

/** Keyed by email, because names change and ids differ per environment. */
export const DRAFTED_SPECIALITIES: Record<string, DraftedSpeciality> = {
  "yoojin.park@utoronto.ca": {
    speciality:
      "Director. Runs the whole thing, which means every question you cannot place ends up here — so place it somewhere else first.",
    rate: "The most expensive five minutes on this page",
    source: BHN,
  },
  "ruilin.yuan@utoronto.ca": {
    speciality:
      "Marketing and communications — and this platform. If the thing you are looking at looks like that, this is the brain responsible.",
    rate: "Already paid in scope creep",
    source: BHN,
  },
  "a.stirling@utoronto.ca": {
    speciality:
      "Business Officer. Budgets, invoices, and whether you can actually spend that. Worth asking before you commit rather than after.",
    rate: "Free, apparently",
    source: BHN,
  },
  "epshita.islam@utoronto.ca": {
    speciality:
      "Advanced Skills Development Lead, ENGAGE — the training pillar. Courses, credits, and who is taking what.",
    rate: "Free, apparently",
    source: BHN,
  },
  "yes.lee@utoronto.ca": {
    speciality:
      "Advanced Skills Development Lead, EXPERIENCE — the placements pillar. Internships, employers, and matching people to them.",
    rate: "Free, apparently",
    source: BHN,
  },
  "roshni.christo@utoronto.ca": {
    speciality:
      "Program Coordinator. Knows where everything actually is, which is a different and rarer skill than knowing where it is supposed to be.",
    rate: "Free, apparently",
    source: BHN,
  },
  "meena.venkatesan@utoronto.ca": {
    speciality:
      "Not listed on the public BioHubNet site, so this one is honestly still blank. Asking what somebody is good at is itself a brain pick.",
    rate: "Free, apparently",
    source: null,
  },
};

export const FALLBACK_SPECIALITY: DraftedSpeciality = {
  speciality: "Unknown. Which has never stopped anybody asking.",
  rate: "Free, apparently",
  source: null,
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
  "google-ads-keywords-feedback": {
    label: "Has left feedback on the Google Ads keywords",
    verdict: (count, status, firstName) => feedbackVerdict(count, status, firstName, "the keywords"),
  },
  "google-ads-adcopy-feedback": {
    label: "Has left feedback on the Google Ads ad copy",
    verdict: (count, status, firstName) => feedbackVerdict(count, status, firstName, "the ad copy"),
  },
};

/** Shared wording for the two Google Ads probes, which differ only in section. */
function feedbackVerdict(count: number, status: PickStatus, firstName: string, what: string): string {
  if (count > 0) return `${firstName} left ${plural(count, "note")} on ${what}. Genuinely helped.`;
  if (status === "answered") return `${firstName} says it is done. There is no feedback from ${firstName} on ${what}.`;
  if (status === "declined") return `${firstName} declined, and left nothing on ${what}.`;
  return `Nothing from ${firstName} on ${what} yet.`;
}

/** The feedback sections these probes count, verbatim from the Google Ads
 *  workspace's own section list (src/components/campaign/GoogleAdsWorkspace.tsx). */
export const GOOGLE_ADS_PROBE_SECTIONS: Record<string, string> = {
  "google-ads-keywords-feedback": "Keywords",
  "google-ads-adcopy-feedback": "Ad copy",
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

/** First token of a name. Internal — prefer callNameOf, which knows when
 *  taking the first token would be a guess. */
export function firstNameOf(name: string | null | undefined, fallback = "They"): string {
  const first = (name ?? "").trim().split(/\s+/)[0];
  return first || fallback;
}

/**
 * What to call somebody in a sentence.
 *
 * In order: what they said to call them, then the first token only when a
 * name is clearly two parts, then the whole name. The last case matters —
 * "Yoo Jin Park" is not "Yoo", and this page puts people's names in
 * sentences about whether they did their homework. Guessing which token is
 * the given name is not worth being wrong about a colleague's name, so
 * where it is ambiguous the full name is used and nothing is assumed.
 *
 * Anyone can end the guesswork for themselves by setting a preferred name
 * on their profile.
 */
export function callNameOf(
  name: string | null | undefined,
  preferredName?: string | null,
  fallback = "They",
): string {
  const preferred = (preferredName ?? "").trim();
  if (preferred) return preferred;
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 2) return parts[0];
  return parts.join(" ") || fallback;
}

/** Initials for the avatar, since nobody on the platform has a photo. */
export function initialsOf(name: string | null | undefined, email = ""): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (email.trim()[0] ?? "?").toUpperCase();
}

// ── Tidying what the model gives back ─────────────────────────────────
// The prompt forbids a greeting and a sign-off; the small model adds one
// anyway, every time. Asking more loudly does not fix it, so the fix is
// deterministic and lives here where it can be tested. Same reasoning as
// sanitizeTemplateEdit in the outreach assistant: never trust the shape
// of a model's output, correct it.

const GREETING = /^(hi|hello|hey|dear|good (morning|afternoon|evening))\b[^\n,:]{0,60}[,:]\s*/i;
const SIGNOFF = /\n+\s*(thanks|thank you|cheers|best|regards|many thanks)\b[\s\S]{0,60}$/i;

/**
 * Strips the greeting and sign-off a model adds despite being told not
 * to. `firstNames` lets a bare "Epshita and Yeseul," opener be removed
 * safely — without them, a sentence that happens to start with a name
 * would be mangled.
 */
export function tidyDraftBody(body: string, firstNames: string[] = []): string {
  let out = (body ?? "").trim();
  out = out.replace(GREETING, "");
  const names = firstNames.filter(Boolean).map((n) => n.replace(/[^\p{L}\p{N}]/gu, ""));
  if (names.length) {
    // "Epshita and Yeseul," / "Epshita, Yeseul —" — names, joiners, then
    // a separator, and nothing else on that opening fragment.
    const alt = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
    out = out.replace(new RegExp(`^(?:(?:${alt})(?:\\s*(?:,|and|&)\\s*)?)+\\s*[,:\u2014-]\\s*`, "iu"), "");
  }
  out = out.replace(SIGNOFF, "");
  return out.trim();
}

/** A subject that names a category rather than the thing is no subject. */
const USELESS_SUBJECTS = new Set([
  "favour", "favor", "question", "task", "request", "help", "quick question",
  "brain pick", "input", "feedback", "advice",
]);

export function subjectIsUseless(subject: string): boolean {
  return USELESS_SUBJECTS.has((subject ?? "").trim().toLowerCase().replace(/[.!?]+$/, ""));
}

// ── Evidence for the Google Ads probes ────────────────────────────────

/** A feedback note on the Google Ads plan, as far as a probe cares. */
export interface FeedbackNote {
  section: string;
  authorName: string;
}

/**
 * How many notes each person left on one section of the Google Ads plan.
 *
 * The workspace records feedback against a NAME, not a user id — see
 * workspaceActorName in src/lib/campaign/google-ads-workspace.ts — so the
 * match is on the name, normalised for case and spacing. That is a real
 * limitation and it fails safe: an unmatched note counts for nobody, so
 * the probe can under-report somebody's help but never invent it.
 */
export function countFeedbackBySection(
  notes: FeedbackNote[],
  section: string,
  namesByUserId: Record<string, string | null>,
): Record<string, number> {
  const norm = (v: string) => v.trim().toLowerCase().replace(/\s+/g, " ");
  const wanted = norm(section);
  const userByName = new Map<string, string>();
  for (const [userId, name] of Object.entries(namesByUserId)) {
    const key = norm(name ?? "");
    if (key) userByName.set(key, userId);
  }
  const out: Record<string, number> = {};
  for (const n of notes) {
    if (norm(n.section ?? "") !== wanted) continue;
    const userId = userByName.get(norm(n.authorName ?? ""));
    if (!userId) continue;
    out[userId] = (out[userId] ?? 0) + 1;
  }
  return out;
}

// ── Prewritten briefs ─────────────────────────────────────────────────
// Ready-made asks for the things the team actually needs eyes on, so the
// common case is one click rather than a blank form.
//
// Each one is written the way the AI aid is told to write: say exactly
// what you want, scope it honestly, say how to answer, say what happens
// with the answer. Each also names the place to reply — and the probe
// counts exactly that, so "said" and "did" are measured against the same
// instruction rather than against a hope.

export interface Brief {
  id: string;
  /** Button label. Short — it sits on a card. */
  label: string;
  /** One line under the label: what this asks for. */
  blurb: string;
  subject: string;
  body: string;
  href: string;
  kind: PickKind;
  probe: string | null;
  bribe: string;
}

export const BRIEFS: Brief[] = [
  {
    id: "merch",
    label: "Merch shortlist",
    blurb: "Which giveaways would they genuinely take home from a booth?",
    subject: "Merch: which of these would you actually take home?",
    body:
      "We are picking trade-show giveaways and I would rather not choose them alone.\n\n" +
      "Open the merch board and star anything you would genuinely take home from a booth. " +
      "Ignore the tiers and the pricing — that part is handled. I want the gut reaction: " +
      "would you carry it out of the venue, or leave it on the table?\n\n" +
      "Two minutes, tops. Set aside anything you think is a mistake.",
    href: "/admin/workspace/merch",
    kind: "task",
    probe: "merch-starred",
    bribe: "a coffee, eventually",
  },
  {
    id: "google-ads-keywords",
    label: "Google Ads keywords",
    blurb: "Do these searches sound like something a real person would type?",
    subject: "Google Ads: would you actually search for any of these?",
    body:
      "We are about to pay for these searches, so I want a second opinion before we do.\n\n" +
      "Open the keywords section and read them as if you were the person searching. " +
      "Two things only: which ones does nobody actually type, and what obvious search are we missing?\n\n" +
      "You do not need to touch the pricing, the match types or the negatives — those are handled. " +
      "Leave anything you spot in the Feedback box at the bottom of that page, under section " +
      "\"Keywords\", so it lands with the plan rather than in my inbox.\n\n" +
      "Five minutes. It goes into the next revision of the plan.",
    href: "/admin/workspace/marketing/google-ads#keywords",
    kind: "question",
    probe: "google-ads-keywords-feedback",
    bribe: "a coffee, eventually",
  },
  {
    id: "google-ads-ad-copy",
    label: "Google Ads ad copy",
    blurb: "Does the wording sound like us, and does it promise anything we cannot do?",
    subject: "Google Ads: does this ad copy sound like us?",
    body:
      "These are the ads that would run under our name, so I would like someone else to read them first.\n\n" +
      "Open the ad copy section and tell me two things: does anything overpromise " +
      "(eligibility, funding, placement), and does anything simply not sound like us?\n\n" +
      "Headlines are capped at 30 characters and descriptions at 90, so if you rewrite a line, " +
      "keep it inside that. Leave it in the Feedback box on that page under section \"Ad copy\".\n\n" +
      "Five minutes, and it is the difference between an ad we stand behind and one we explain later.",
    href: "/admin/workspace/marketing/google-ads#ad-copy",
    kind: "question",
    probe: "google-ads-adcopy-feedback",
    bribe: "a coffee, eventually",
  },
];

export function briefById(id: string): Brief | undefined {
  return BRIEFS.find((b) => b.id === id);
}

/** Kept as a named export: the merch ask is the one with its own button. */
export const MERCH_BRIEF = BRIEFS[0];
