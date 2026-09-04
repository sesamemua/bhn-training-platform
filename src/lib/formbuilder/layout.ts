/**
 * One column, shared by every screen a registrant sees.
 *
 * The public page set its own width, the form set another and the
 * confirmation a third — 820, 760 and 720, each centred inside the
 * last. Centred boxes of different widths do not share a left edge, so
 * the page title, the questions and the receipt each started at a
 * different margin and the reader's eye had to re-find it twice.
 *
 * A constant rather than a comment saying "keep these in step": the
 * two places that drifted were two literals, and a literal cannot be
 * kept in step by good intentions.
 */
export const FORM_COLUMN = "mx-auto w-full max-w-[760px]";
