/**
 * Open, paused, closed — the switch on the Training Week registration.
 *
 * `EventForm.active` is the boolean everything already obeys: the
 * public page draws the questions, the submit action takes an answer,
 * the upload route accepts a photo. It cannot tell the difference
 * between "we are pausing for an hour" and "that is it, we are done",
 * and a registrant reading "Registration is closed." while a
 * coordinator fixes a session for ten minutes has been told the wrong
 * thing.
 *
 * So the state lives beside it in one PlatformSetting row, and the
 * boolean is kept in step with it: active === (state === "open"). One
 * switch, three words for what it means, and nothing else in the
 * platform has to learn a third state to keep working.
 *
 * Pure module: no Prisma, no React. The row is read and written by the
 * admin route and the public page.
 */

/** The PlatformSetting row this lives in. */
export const REGISTRATION_STATE_KEY = "trainingWeek.registrationState";

export const REGISTRATION_STATES = ["open", "paused", "closed"] as const;
export type RegistrationState = (typeof REGISTRATION_STATES)[number];

export interface RegistrationSwitch {
  state: RegistrationState;
  /** When it was last moved, ISO. Null when nobody has touched it. */
  at: string | null;
  /** Who moved it, for the admin card. Never shown to a registrant. */
  by: string | null;
}

const isState = (v: unknown): v is RegistrationState =>
  typeof v === "string" && (REGISTRATION_STATES as readonly string[]).includes(v);

/**
 * The stored row, read defensively.
 *
 * `fallback` is what the forms themselves say — open when any version
 * is taking registrations. It matters on the first read, before the
 * switch has ever been touched: the answer then has to be what is
 * actually true rather than a default, or the card would offer to
 * "open" a form that is already open.
 */
export function parseSwitch(value: string | null | undefined, fallback: RegistrationState): RegistrationSwitch {
  if (!value) return { state: fallback, at: null, by: null };
  try {
    const raw = JSON.parse(value) as Record<string, unknown>;
    return {
      state: isState(raw.state) ? raw.state : fallback,
      at: typeof raw.at === "string" ? raw.at : null,
      by: typeof raw.by === "string" ? raw.by : null,
    };
  } catch {
    // A row somebody edited by hand is not a reason to close registration.
    return { state: fallback, at: null, by: null };
  }
}

/** What goes in the row. */
export const serialiseSwitch = (s: RegistrationSwitch): string => JSON.stringify(s);

/**
 * What the public page says instead of the questions.
 *
 * Null when the form is open — there is nothing to say, and the
 * questions are the answer. The two closed states differ only in
 * whether they promise to come back, which is the whole reason for
 * having both: a promise nobody meant is worse than a plain "closed".
 */
export function publicNotice(state: RegistrationState): { title: string; body: string } | null {
  if (state === "open") return null;
  if (state === "paused") {
    return {
      title: "Registration is paused",
      body:
        "We have stopped taking registrations for a moment while we sort something out. " +
        "It will reopen shortly — come back a little later, or email the BioHubNet team if it matters today.",
    };
  }
  return {
    title: "Registration is closed",
    body:
      "Training Week registration has closed. " +
      "If you think it should still be open, email the BioHubNet team and they will look into it.",
  };
}

/** How the admin card names each state, and what pressing it does. */
export const STATE_COPY: Record<RegistrationState, { label: string; doing: string; gist: string }> = {
  open: {
    label: "Open",
    doing: "Open registration",
    gist: "People can fill in the form and submit it.",
  },
  paused: {
    label: "Paused",
    doing: "Pause registration",
    gist: "The form says it will reopen shortly. Nothing already registered is affected.",
  },
  closed: {
    label: "Closed",
    doing: "Close registration",
    gist: "The form says registration has closed, with no promise to reopen.",
  },
};
