/**
 * The words, written from the cycle rather than typed into a box.
 *
 * A draft, not a decree: everything here lands in an editable field and
 * a person approves it before it goes anywhere. The point is that the
 * FACTS in it — the deadline, the amount, the count — come from the
 * same rows the applicant-facing pages read, so a post and the site
 * cannot disagree about when the window shuts.
 *
 * Deliberately plain. These are drafts for a coordinator to sharpen,
 * and a draft that arrives already over-written is harder to edit than
 * one that arrives flat. No exclamation marks, no "excited to announce",
 * no emoji — the house voice elsewhere in this codebase does not use
 * them and a social post is not the place to start.
 *
 * Pure module: no Prisma, no clock.
 */
import { readableDate } from "./plan";
import type { AssetSpec, CycleFacts, Recipient, SocialKind } from "./types";

const money = (n: number) =>
  n.toLocaleString("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });

/** "2 days", "1 day", "today". */
function countdown(daysLeft: number): string {
  if (daysLeft <= 0) return "today";
  if (daysLeft === 1) return "1 day";
  return `${daysLeft} days`;
}

export interface DraftInput {
  kind: SocialKind;
  facts: CycleFacts;
  /** Reminders only. */
  daysLeft?: number;
  /** Recipients posts only, and only those who consented to be named. */
  recipients?: Recipient[];
  /** False when the cycle has chosen not to publish award amounts. */
  showAmounts?: boolean;
}

export interface Draft {
  body: string;
  asset: AssetSpec;
}

export function draftPost(input: DraftInput): Draft {
  switch (input.kind) {
    case "launch": return launch(input.facts);
    case "reminder": return reminder(input.facts, input.daysLeft ?? 0);
    case "recipients": return recipients(input.facts, input.recipients ?? [], input.showAmounts !== false);
  }
}

function launch(f: CycleFacts): Draft {
  const closes = readableDate(f.deadlineAt);
  return {
    body: [
      `VentureConnect is open for the ${f.cycleLabel} cycle.`,
      "",
      `Up to ${money(f.maxAward)} per company towards attending one conference, investor event, customer engagement activity, entrepreneurship workshop or pitch competition.`,
      "",
      "Open to STEM graduate students, postdoctoral fellows and research associates who are a founder or hold a leadership role in an early-stage venture in biomanufacturing or life sciences.",
      "",
      `Applications close ${closes}. No BioHubNet account needed.`,
      "",
      `Apply: ${f.applyPath}`,
    ].join("\n"),
    asset: {
      version: 1,
      template: "vc-launch",
      headline: "VentureConnect is open",
      subhead: `Up to ${money(f.maxAward)} per company`,
      footnote: `Applications close ${closes}`,
      names: [],
      sizes: ["square", "portrait"],
    },
  };
}

function reminder(f: CycleFacts, daysLeft: number): Draft {
  const closes = readableDate(f.deadlineAt);
  const left = countdown(daysLeft);
  // The closing-day post is a different message, not a smaller one.
  const lead = daysLeft <= 0
    ? `Last day to apply for VentureConnect — applications close today, ${closes}.`
    : `${left} left to apply for VentureConnect. Applications close ${closes}.`;
  const moved = f.deadlineAt.getTime() !== f.originalDeadlineAt.getTime()
    ? `\n\nThis deadline was extended from ${readableDate(f.originalDeadlineAt)}.`
    : "";
  return {
    body: [
      lead,
      "",
      `Up to ${money(f.maxAward)} per company towards a conference, investor event, customer engagement activity, entrepreneurship workshop or pitch competition.`,
      `${moved}`,
      `Apply: ${f.applyPath}`,
    ].join("\n").replace(/\n{3,}/g, "\n\n"),
    asset: {
      version: 1,
      template: "vc-reminder",
      headline: daysLeft <= 0 ? "Closes today" : `${left} left`,
      subhead: "VentureConnect applications",
      footnote: `Closes ${closes}`,
      names: [],
      sizes: ["square", "portrait"],
    },
  };
}

function recipients(f: CycleFacts, list: Recipient[], showAmounts: boolean): Draft {
  const named = list.map((r) => {
    const amount = showAmounts && r.amount !== null ? ` — ${money(r.amount)}` : "";
    return `${r.name}, ${r.venture}${amount}`;
  });
  const total = list.reduce((n, r) => n + (r.amount ?? 0), 0);
  const totalLine = showAmounts && total > 0
    ? `\n${money(total)} awarded across ${list.length} ${list.length === 1 ? "venture" : "ventures"}.`
    : "";
  return {
    body: [
      `Congratulations to the ${f.cycleLabel} VentureConnect recipients.`,
      "",
      ...named.map((n) => `• ${n}`),
      totalLine,
      "",
      "VentureConnect supports STEM founders getting to the conferences, investor events and customer meetings that move a venture forward.",
      "",
      `The next cycle: ${f.applyPath}`,
    ].join("\n").replace(/\n{3,}/g, "\n\n"),
    asset: {
      version: 1,
      template: "vc-recipients",
      headline: `${f.cycleLabel} VentureConnect recipients`,
      subhead: showAmounts && total > 0 ? `${money(total)} awarded` : "",
      footnote: `${list.length} ${list.length === 1 ? "venture" : "ventures"}`,
      names: list.map((r) => ({
        name: r.name,
        detail: showAmounts && r.amount !== null ? `${r.venture} · ${money(r.amount)}` : r.venture,
      })),
      sizes: ["square", "landscape"],
    },
  };
}
