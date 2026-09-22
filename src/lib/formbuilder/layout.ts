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

/**
 * The column a form with a calendar gets.
 *
 * 760 is a reading width, which is right for questions and wrong for a
 * week: three Tuesday sessions share that day's column, so each lane
 * had about eighty pixels and the cells were reduced to "13:00–16…".
 * A calendar is a picture, and a picture that cannot be read is not
 * one.
 *
 * Only the forms that have one — see columnFor. Widening every form
 * would buy the calendar its room by making every question a
 * hundred-character line.
 */
export const WIDE_FORM_COLUMN = "mx-auto w-full max-w-[1040px]";

/** Which of the two a form gets: a question with time slots is a calendar. */
export function columnFor(doc: { fields: { slots?: unknown[] }[] }): string {
  return doc.fields.some((f) => (f.slots?.length ?? 0) > 0) ? WIDE_FORM_COLUMN : FORM_COLUMN;
}
