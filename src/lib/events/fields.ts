/**
 * Which optional questions the speaker intake form asks, for one event.
 *
 * The same shape as speakerLimits next door, and for the same reason:
 * everything that renders, validates or stores one of these reads it
 * from here, so the form and the endpoint cannot disagree about what
 * was asked.
 *
 * WHY THIS EXISTS. The pitch and the LinkedIn fields were hidden in one
 * commit for every event at once. Two things followed. An event whose
 * speakerPitchMaxWords had been deliberately raised to 250 was left
 * with a setting configuring a field nobody could see. And because the
 * intake creates a new speaker row rather than updating one, anybody
 * asked to fill the form again came back with LESS than they had given
 * the first time — a chase turned into a deletion. Per event, one event
 * turning a question off cannot do that to another.
 */

/** The shape any caller needs to select from BhnEvent. */
export interface EventFieldFlags {
  speakerAskSessionTitle: boolean;
  speakerAskSessionPitch: boolean;
  speakerAskLinkedin: boolean;
}

export interface SpeakerFields {
  /** A programme line — "Translating research into industry". */
  sessionTitle: boolean;
  /** What the session offers, in the speaker's own words. */
  sessionPitch: boolean;
  linkedin: boolean;
}

/**
 * True for everything, which is what the form asked before the fields
 * were hidden. Used for an event that has not been loaded — better to
 * ask an extra question than to silently drop an answer somebody typed.
 */
export const ALL_SPEAKER_FIELDS: SpeakerFields = {
  sessionTitle: true,
  sessionPitch: true,
  linkedin: true,
};

export function speakerFields(event: EventFieldFlags | null | undefined): SpeakerFields {
  if (!event) return ALL_SPEAKER_FIELDS;
  return {
    sessionTitle: event.speakerAskSessionTitle,
    sessionPitch: event.speakerAskSessionPitch,
    linkedin: event.speakerAskLinkedin,
  };
}

/** What an admin sees on the Speakers page, in the order the form asks. */
export const SPEAKER_FIELD_LABELS: { key: keyof SpeakerFields; label: string; hint: string }[] = [
  {
    key: "sessionTitle",
    label: "Session title",
    hint: "A programme line, as it should appear beside their name.",
  },
  {
    key: "sessionPitch",
    label: "What their session offers",
    hint: "A paragraph in their own words. Governed by the pitch word limit above.",
  },
  {
    key: "linkedin",
    label: "LinkedIn profile",
    hint: "Optional for the speaker either way — this decides whether they are asked at all.",
  },
];
