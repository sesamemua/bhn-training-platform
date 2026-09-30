/**
 * What in a video script is direction rather than script: picture and
 * on-screen notes, editor's notes, interviewer cues, and any paragraph
 * that starts with a "Picture:" / "Visual:" / "Sound:"-style label.
 * Video scripts hide these by default, with an eye button to show them.
 */
export const DIRECTIONS_SELECTOR = ".visual-note, .script-note, .note, .cue, p:has(> .k:first-child)";
export const HIDE_DIRECTIONS_CSS = `${DIRECTIONS_SELECTOR} { display: none !important; }`;
