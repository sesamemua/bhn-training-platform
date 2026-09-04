"use client";

/**
 * Choosing sessions off the week — the registrant's side of the grid.
 *
 * The drawing itself is `WeekGrid`: hour scale, day columns, lanes,
 * block geometry. This file is the adapter for ONE kind of data (a
 * form field's `slots`, plus the options a person has clicked) and the
 * contents of one kind of cell (a rank badge, a time, a name). The
 * Admin dashboard is the other adapter over the same drawing.
 *
 * The first version drew every session as an equal-height card grouped
 * into rows, which is a list wearing a calendar's clothes: the CL3
 * workshop runs 09:30 to 17:00 and the CCRM tour runs 11:00 to 13:30,
 * and nothing on screen said one was three times the other. Picking a
 * session is a decision about your day, and a picture that flattens
 * duration hides the part of the decision that matters.
 */
import { useMemo, type ReactNode } from "react";
import { chosenConflicts, clashes as overlaps, sessionParts, type Placed, type Slot } from "@/lib/formbuilder/calendar";
import { gridFromSlots, toMinutes } from "@/lib/allocation/schedule";
import { dayLabel, HOUR_SCALE, WeekGrid, type WeekBlock } from "./WeekGrid";
import type { FormField } from "@/lib/formbuilder/types";

// The ranking list below the grid spells the day the same way the day
// headings above it do, which is the whole reason this lives in one
// place. Re-exported because it reads as part of this component's
// surface even though the drawing owns it.
export { dayLabel };

/**
 * "1st", "2nd", "3rd" — not "1".
 *
 * A bare numeral on a calendar cell reads as a count, a room number or
 * a day. An ordinal can only be a position, which is the one thing it
 * is trying to say.
 */
export function ordinal(n: number): string {
  const t = n % 100;
  if (t >= 11 && t <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}

/**
 * The same drawing, before and after.
 *
 * `readOnly` is the confirmation screen: the week a registrant picked
 * from, drawn identically, with nothing left to click. A union rather
 * than two optional props so the type system says what the modes mean —
 * a picker cannot forget its `onToggle`, and a receipt cannot be handed
 * one.
 *
 * The rule that keeps this from becoming a second implementation: the
 * mode may fork the CHROME — which element, hover, aria, the caption —
 * and cannot fork the GEOMETRY, because the geometry is not reachable
 * from here at all. `WeekGrid` takes a description of a cell and
 * positions it itself; there is no `top` or `left` in this file to get
 * a `readOnly` test wedged into.
 */
export type SessionCalendarProps = {
  field: FormField;
  /** Chosen options in click order — the index IS the rank. */
  chosen: string[];
} & (
  | { readOnly?: false; onToggle: (option: string) => void; caption?: never }
  | {
      readOnly: true;
      onToggle?: never;
      /** Replaces the picker's instructions. Omit for no caption. */
      caption?: string;
    }
);

/**
 * "1st choice" — the same object wherever a rank is shown.
 *
 * It was written out four times: on the calendar cell, on the
 * unscheduled chip, and twice in the two ranking lists — and the two
 * lists had already drifted to a bare brand-coloured word in a 36px
 * gutter holding a 22px ordinal. A rank is one thing and should look
 * like one thing, on the grid and in the list, before and after.
 */
export function RankBadge({ rank, word }: { rank: number; word?: boolean }) {
  return (
    <span className="inline-flex shrink-0 items-center rounded bg-brand px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
      {ordinal(rank)}{word ? " choice" : ""}
    </span>
  );
}

export function SessionCalendar(props: SessionCalendarProps) {
  const { field, chosen } = props;
  const ro = props.readOnly === true;
  const grid = useMemo(() => gridFromSlots(field.slots), [field.slots]);
  // Same function the warning panel uses — the tint and the text must
  // never disagree about what conflicts.
  const clashing = useMemo(
    () => chosenConflicts(field.slots, chosen, field.cannotCombine ?? []),
    [field.slots, chosen, field.cannotCombine],
  );
  // Options with no time given still need somewhere to be chosen.
  const unscheduled = field.options.filter((o) => !field.slots.some((s) => s.option === o));

  /*
   * A receipt draws the days you chose something on.
   *
   * Filtered here, downstream of `gridFromSlots`, so the hour bounds
   * and the lane packing are byte-identical to the picker's — a day
   * that IS drawn is the same drawing, unchosen neighbours and all.
   * (Those stay: CL3's half-width block looks broken with an empty
   * half beside it.) A whole day with nothing chosen has no such
   * argument; it is noise on a record, and three of them stacked is
   * what made the phone receipt too long to show at all.
   */
  const days = ro
    ? grid.days.filter((d) => d.slots.some((sl) => chosen.includes(sl.option)))
    : grid.days;

  /*
   * Full. Drawn, not just silently refused.
   *
   * A cell that does nothing when clicked reads as broken. Dimmed and
   * disabled with a reason on it reads as "you have used your three",
   * which is the actual situation.
   */
  const cap = field.maxChoices;
  // Nothing is over the cap once it has been submitted — dimming a cell
  // against a limit that no longer applies is a warning about a decision
  // nobody can still make.
  const atCap = !ro && cap !== undefined && chosen.length >= cap;

  // The day prefix is already the column heading, and the hours are
  // already the left-hand scale — repeating both inside every box eats
  // the room the actual name needs.
  const shortLabel = (option: string) => sessionParts(option).name;

  if (days.length === 0) {
    return (
      <div className="mt-2">
        <div className="flex flex-wrap gap-2">
          {unscheduled.map((o) => (
            <Chip key={o} label={o} rank={chosen.indexOf(o)} full={atCap} onClick={ro ? undefined : () => props.onToggle(o)} />
          ))}
        </div>
        {/* Said in both branches. A framed row of dimmed chips with the
            caption silently dropped is a receipt that does not say what
            it is showing. */}
        {ro && props.caption && (
          <p className="mt-1.5 text-[11px] leading-snug text-subtle">{props.caption}</p>
        )}
      </div>
    );
  }

  /** One session, as a cell. Chrome only — the box is WeekGrid's. */
  const cell = (sl: Placed): WeekBlock => {
    /*
     * RANK, from the order you clicked in.
     *
     * The question has always been called "choose and rank", and the
     * array already kept click order — nothing on screen said so, so it
     * read as a plain multi-select and the order looked accidental.
     */
    const rank = chosen.indexOf(sl.option);
    const on = rank >= 0;
    const clashes = clashing.some((c) => c.a === sl.option || c.b === sl.option);
    // `overlaps` is false across days, so this counts the day's own.
    const against = days
      .flatMap((d) => d.slots)
      .filter((o) => o.option !== sl.option && overlaps(sl, o)).length;
    const minutes = toMinutes(sl.end) - toMinutes(sl.start);
    const blocked = !on && atCap;

    const children = (
      <>
        {/* The ranking leads. Once a session is picked, its position is
            the thing the reader is checking — the hours are already the
            scale it is drawn against. */}
        {on && <span className="mb-0.5 block"><RankBadge rank={rank + 1} word /></span>}
        <span className="block truncate font-mono text-[9.5px] text-subtle">
          {sl.start}–{sl.end}
        </span>
        <span className={`mt-0.5 block text-[11px] leading-tight ${on ? "font-semibold text-fg" : "text-muted"}`}>
          {shortLabel(sl.option)}
        </span>
        {/* Only where there is room for it. A hint that overflows its
            own box is not a hint — and on a receipt it is not a hint at
            all: what a session you did not pick ran against is guidance
            for a decision already made. */}
        {!ro && against > 0 && minutes >= 120 && (
          <span className="mt-1 block text-[9.5px] text-subtle">
            runs against {against} other{against > 1 ? "s" : ""}
          </span>
        )}
      </>
    );

    const className = `${blocked ? "cursor-not-allowed opacity-40 " : ""}${
      on
        ? clashes
          ? "border-red-500 bg-red-500/15"
          : "border-brand-500 bg-brand-500/15"
        // Not chosen, and nothing left to choose: kept on the drawing,
        // faded. The week they picked FROM is the context that makes a
        // rank mean anything, but it must not compete with what they
        // picked.
        : ro
          ? "border-line/70 bg-card opacity-45"
          : "border-line bg-card hover:border-brand-400"
    }`;

    const name = `${shortLabel(sl.option)} · ${sl.start}–${sl.end}`;

    // A div, not a disabled button: omitting `press` is what asks for
    // one. The obvious shortcut — keep the button and drop the handler
    // — leaves a focusable control carrying aria-pressed that does
    // nothing when clicked, which this file already rules on: a cell
    // that does nothing when clicked reads as broken.
    if (ro) return { className, title: name, children };

    return {
      className,
      title: blocked ? `${cap} is the most you can choose — take one back first` : name,
      children,
      press: { onClick: () => props.onToggle(sl.option), pressed: on, disabled: blocked },
    };
  };

  return (
    <div className="mt-2.5">
      {/* On the receipt this is a picture of what the ranked list
          beneath it states in words — rank, name, day and time. A
          screen reader gets the sentence; a maze of absolutely
          positioned divs would only add noise to it. */}
      <WeekGrid
        grid={{ ...grid, days }}
        scale={ro ? HOUR_SCALE.read : HOUR_SCALE.pick}
        decorative={ro}
        // 22px is breathing room, not alignment: the grid works out for
        // itself where the day bodies start. It is here because a
        // one-line heading sitting flush on the grid's top border reads
        // as part of the border.
        head={(day) => (
          <p className="h-[22px] text-[10.5px] font-bold uppercase tracking-wide text-subtle @xl:text-center">
            {dayLabel(day)}
          </p>
        )}
        block={cell}
      />

      {/* The picker's copy is written in the imperative — "the order you
          click in", "click one again to take it back" — which is the
          wrong tense on a page where nothing can be clicked. */}
      {ro ? (
        props.caption && (
          <p className="mt-1.5 text-[11px] leading-snug text-subtle">{props.caption}</p>
        )
      ) : (
        <p className="mt-1.5 text-[11px] leading-snug text-subtle">
          Height is how long a session runs. Anything drawn side by side is on at the same time.
          The order you click in is your order of preference: first pick, first choice.
          {cap !== undefined && (
            atCap
              ? ` You have chosen all ${cap}. Click one again to take it back.`
              : ` You can choose up to ${cap} — ${cap - chosen.length} left.`
          )}
          {cap === undefined && " Choose as many as you like."}
        </p>
      )}

      {unscheduled.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {unscheduled.map((o) => (
            <Chip key={o} label={o} rank={chosen.indexOf(o)} full={atCap} onClick={ro ? undefined : () => props.onToggle(o)} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The ranking, written out — the same box before and after.
 *
 * The badges on the calendar give each cell its position; this gives
 * the ORDER, which is the thing the question actually asks for and the
 * thing a coordinator reads off the answer. Its own box, because on a
 * busy calendar a line of text underneath is not where anybody looks to
 * check what they chose.
 *
 * Shared because it had drifted. While picking it was a brand-tinted
 * box with pill ordinals; on the confirmation, one screen later, the
 * same three sessions came back as a plain grey list with a 4px wider
 * gutter and the DAY thrown away entirely — so a registrant who had
 * just ranked "Tue 13:00–16:30" was shown "13:00–16:30" with nothing
 * anywhere saying Tuesday. One component, so the receipt cannot say it
 * differently from the form.
 */
export function RankedChoices({
  chosen, label, note, slots = [],
}: { chosen: string[]; label: string; note?: ReactNode; slots?: Slot[] }) {
  if (chosen.length === 0) return null;
  return (
    <div className="@container mt-3 rounded-lg border-2 border-brand-500/40 bg-brand-500/[0.06] p-3">
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-brand-500">{label}</p>
      <ol className="mt-2 space-y-1.5">
        {chosen.map((o, i) => {
          const parts = sessionParts(o);
          const slot = slots.find((sl) => sl.option === o);
          // The date if we have one, the coordinator's text if we do not.
          const day = slot ? dayLabel(slot.day) : parts.day;
          const { time, name } = parts;
          return (
            <li key={o} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              {/* The same w-11 rail the hour scale occupies directly
                  above, right-aligned the same way — so the pills end
                  where the hours end and the session names start where
                  the day columns start. Two blocks, one left edge. */}
              <span className="flex w-11 shrink-0 justify-end">
                <RankBadge rank={i + 1} />
              </span>
              <span className="min-w-0 flex-1 text-[13px] leading-snug text-fg">{name}</span>
              {/* On its own line on a phone, indented to sit under the
                  name rather than beside a name already wrapping to
                  three lines; out to the right edge once there is room
                  for both. */}
              {(day || time) && (
                <span className="w-full shrink-0 whitespace-nowrap pl-[3.25rem] font-mono text-[11px] tabular-nums text-subtle @sm:w-auto @sm:pl-0">
                  {[day, time].filter(Boolean).join(" · ")}
                </span>
              )}
            </li>
          );
        })}
      </ol>
      {note && <p className="mt-2 text-[12px] leading-snug text-muted">{note}</p>}
    </div>
  );
}

/**
 * An option with no time on it — nowhere to put it on the grid.
 *
 * No `onClick` means the receipt: a span rather than a button, for the
 * same reason the grid cells switch to divs.
 */
function Chip({
  label, rank, full, onClick,
}: { label: string; rank: number; full: boolean; onClick?: () => void }) {
  const on = rank >= 0;
  const badge = on && <RankBadge rank={rank + 1} />;
  const cls = `inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
    on
      ? "border-brand-500 bg-brand-500/12 font-semibold text-fg"
      : onClick
        ? "border-line text-muted hover:bg-elevated"
        : "border-line/70 text-muted opacity-45"
  }`;

  if (!onClick) return <span className={cls}>{badge}{label}</span>;

  return (
    <button type="button" onClick={onClick} aria-pressed={on} disabled={!on && full} className={cls}>
      {badge}
      {label}
    </button>
  );
}
