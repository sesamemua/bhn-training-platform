import { prisma } from "@/lib/prisma";

/**
 * The register of things a colleague can be told about.
 *
 * One entry per admin feature. Adding a feature to this file is the
 * whole job of making it notifiable — the API route, the email and the
 * panel are generic and read from here, so nothing else has to change.
 *
 * Why a register rather than a prop on each panel: the email is sent by
 * the SERVER, and a server that takes its wording from the browser is a
 * server that will send whatever anybody posts to it. The client sends
 * an id; the words come from this file.
 */

export interface NotifyLink {
  label: string;
  /** Path only. The origin is added at send time from the environment. */
  path: string;
  /** One line under the button: who it is for, what it does. */
  note: string;
  /** The one big button. Exactly one link should set this. */
  primary?: boolean;
}

export interface NotifyFeature {
  id: string;
  /** Shown in the panel and used in the subject line. */
  name: string;
  /**
   * The brief introduction, one or two sentences. This is the whole
   * body of the email — a colleague being told about a feature needs to
   * know what it is and where it is, and nothing else.
   */
  intro: string;
  /** Where the links point. `context` is whatever the panel passed. */
  links(context: string | null): NotifyLink[];
  /**
   * True when links() needs a context string to be correct. The route
   * refuses to send without one, rather than emailing a broken URL.
   */
  needsContext?: boolean;
  /** What the context is, for the error message when it is missing. */
  contextLabel?: string;
  /**
   * A live warning to put in the email, resolved HERE from the database.
   *
   * It used to be a string the panel posted, which meant the browser
   * chose the wording — against this file's whole reason for existing —
   * and meant a stale tab could send "the form is open" minutes after
   * somebody else closed it.
   */
  caveat?(context: string | null): Promise<string | null>;
  /** A human name for the context, so the subject can say which event. */
  contextName?(context: string | null): Promise<string | null>;
}

const FEATURES: NotifyFeature[] = [
  {
    id: "speaker-intake",
    name: "Speaker details",
    intro:
      "Invited speakers can now fill in their own details — headshot, title, organisation, a short bio, LinkedIn and what their session will offer. No account, no login, one link. What they send lands on an admin page for you to check before it goes anywhere near the website.",
    needsContext: true,
    contextLabel: "event slug",
    async caveat(slug) {
      if (!slug) return null;
      const e = await prisma.bhnEvent.findUnique({
        where: { slug },
        select: { speakerIntakeOpen: true },
      });
      if (!e) return null;
      return e.speakerIntakeOpen
        ? null
        : "Heads up: the form is currently closed and will not accept submissions until somebody opens it on the admin page below.";
    },
    async contextName(slug) {
      if (!slug) return null;
      const e = await prisma.bhnEvent.findUnique({ where: { slug }, select: { title: true } });
      return e?.title ?? null;
    },
    links: (slug) => [
      {
        label: "Open the speaker form",
        path: `/events/${encodeURIComponent(slug ?? "")}/speaker`,
        note: "The public page — safe to forward to anyone you have invited.",
        primary: true,
      },
      {
        label: "See what they send",
        path: `/admin/events/${encodeURIComponent(slug ?? "")}/speakers`,
        note: "Staff only — sign in with your platform account.",
      },
    ],
  },
];

const BY_ID = new Map(FEATURES.map((f) => [f.id, f]));

export function notifyFeature(id: string): NotifyFeature | null {
  return BY_ID.get(id) ?? null;
}

export function allNotifyFeatures(): NotifyFeature[] {
  return [...FEATURES];
}

/* Two ids for the same feature would make one of them unreachable, and
 * the one that lost is the one whose panel silently sends the other's
 * email. Cheaper to find at import than in somebody's inbox. */
if (BY_ID.size !== FEATURES.length) {
  throw new Error("Duplicate notify feature id in src/lib/notify/features.ts");
}
