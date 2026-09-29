"use client";

/**
 * Internal people — BioHubNet staff and named guests (Darius, Gilbert)
 * who sit in on sessions. In the room and at lunch; never in a student
 * seat, never ranked against a student for one.
 *
 * Two things live here: the list (who counts as internal, and what the
 * caterer needs to know about them), and which sessions each of them is
 * at. Ticking a session gives them a seat outside the student count;
 * somebody who registered through the form keeps the seat they asked
 * for, shown here but not toggled.
 */
import { useMemo, useState, useTransition } from "react";
import { Loader2, Plus, Trash2, UserCheck } from "lucide-react";
import { emailKey } from "@/lib/eligibility/email-key";
import type { AdminWorkshop } from "@/lib/allocation/admin-types";
import type { InternalPerson } from "@/lib/training-week/internal";
import { saveInternalPeople, setInternalAttendance } from "@/app/(dashboard)/admin/workspace/training-admin/actions";

const tz = "America/Toronto";
const day = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, weekday: "short" }).format(new Date(iso));
const INPUT = "w-full rounded-md border border-line bg-elevated px-2 py-1 text-[12.5px] text-fg outline-none focus-visible:border-brand-500";

export function InternalPeople({
  initial, staff, workshops,
}: { initial: InternalPerson[]; staff: { name: string; email: string }[]; workshops: AdminWorkshop[] }) {
  const [people, setPeople] = useState<InternalPerson[]>(initial);
  const [draft, setDraft] = useState<InternalPerson>({ name: "", email: "", dietary: "" });
  const [said, setSaid] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const live = useMemo(() => workshops.filter((w) => w.isActive), [workshops]);

  /**
   * Their seat in a session, if any: made here, or asked for themselves
   * through the form — at any stage, not only once approved. Missing a
   * request that is still "not decided" is how a person ends up with two
   * seats in one room.
   */
  const seatOf = (p: InternalPerson, w: AdminWorkshop) =>
    w.bookings.find((b) => {
      if (!b.internal || b.status === "cancelled") return false;
      const e = b.applicant.email ?? "";
      return p.email ? emailKey(e) === emailKey(p.email) : b.internalMade && b.applicant.name === p.name;
    }) ?? null;

  function save(next: InternalPerson[], message: string) {
    start(async () => {
      const r = await saveInternalPeople(next);
      if (!r.ok) { setSaid(r.problem ?? "Could not save."); return; }
      setPeople(r.people ?? next);
      setSaid(message);
    });
  }

  function add() {
    const name = draft.name.trim();
    if (!name) { setSaid("Give them a name."); return; }
    const email = draft.email.trim();
    if (email && !emailKey(email)) { setSaid("That is not an email address."); return; }
    if (people.some((p) => (email && p.email.toLowerCase() === email.toLowerCase()) || (!email && p.name === name))) {
      setSaid(`${name} is already on the list.`);
      return;
    }
    save([...people, { name, email, dietary: draft.dietary.trim() }], `Added ${name}.`);
    setDraft({ name: "", email: "", dietary: "" });
  }

  function remove(p: InternalPerson) {
    const held = live.filter((w) => seatOf(p, w)?.internalMade).length;
    if (!confirm(`Take ${p.name} off the Internal list?${held ? `\n\nTheir ${held} session seat${held === 1 ? "" : "s"} made here stay until you untick them first.` : ""}`)) return;
    save(people.filter((x) => x !== p), `Removed ${p.name}.`);
  }

  function toggle(p: InternalPerson, w: AdminWorkshop, on: boolean) {
    const key = `${p.name}|${w.id}`;
    setBusy(key);
    start(async () => {
      const r = await setInternalAttendance(p, w.id, on);
      setBusy(null);
      setSaid(r.ok ? `${p.name} ${on ? "added to" : "taken out of"} ${w.title}.` : r.problem ?? "Could not save.");
    });
  }

  return (
    <section className="mt-6 rounded-lg border border-line bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[13px] font-bold text-fg">
          <UserCheck size={14} className="text-indigo-600" /> Internal people
        </p>
        {pending && <Loader2 size={13} className="animate-spin text-muted" />}
      </div>
      <p className="mt-1 max-w-prose text-[12px] leading-snug text-muted">
        BioHubNet staff and guests who sit in on a session. They are counted <strong className="text-fg">beside</strong> a
        room&apos;s capacity, never in it, and are never ranked against a student — but they are in the check-in list and the
        caterer&apos;s numbers. Staff accounts and any <span className="font-mono">@biohubnet.ca</span> address count
        automatically; add anyone else here, with their address so they are recognised if they register themselves.
      </p>
      {staff.length > 0 && (
        /* Staff are internal by rule, not by being listed: shown so nobody
           adds them twice or wonders whether they are covered. */
        <p className="mt-2 text-[12px] leading-snug text-muted">
          <span className="font-semibold text-fg">Always internal — every staff account:</span>{" "}
          {staff.map((x) => x.name).join(", ")}. If one of them registers with another address, add them below with that address.
        </p>
      )}

      <div className="mt-3 overflow-x-auto rounded-lg border border-line">
        <table className="w-full min-w-[640px] border-collapse text-[12.5px]">
          <thead>
            <tr className="bg-elevated text-left text-[10.5px] font-bold uppercase tracking-wide text-subtle">
              <th className="px-2.5 py-2">Person</th>
              <th className="px-2.5 py-2">Dietary</th>
              {live.map((w) => (
                <th key={w.id} className="px-1.5 py-2 text-center normal-case tracking-normal" title={w.title}>
                  <span className="block text-[10px] uppercase text-subtle">{day(w.startDateTime)}</span>
                  <span className="block max-w-[7rem] truncate text-[11px] font-semibold text-fg">{w.title}</span>
                </th>
              ))}
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {people.length === 0 && (
              <tr><td colSpan={live.length + 3} className="px-2.5 py-3 text-[12.5px] text-muted">Nobody yet. Add staff and guests below.</td></tr>
            )}
            {people.map((p) => (
              <tr key={`${p.name}|${p.email}`} className="border-t border-line">
                <td className="px-2.5 py-1.5">
                  <span className="block font-semibold text-fg">{p.name}</span>
                  <span className="block font-mono text-[10.5px] text-subtle">{p.email || "no address"}</span>
                </td>
                <td className="px-2.5 py-1.5">
                  <input
                    defaultValue={p.dietary}
                    placeholder="None"
                    className={INPUT}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v !== p.dietary) save(people.map((x) => (x === p ? { ...x, dietary: v } : x)), `Saved ${p.name}'s dietary note.`);
                    }}
                  />
                </td>
                {live.map((w) => {
                  const seat = seatOf(p, w);
                  const mine = !seat || seat.internalMade;
                  return (
                    <td key={w.id} className="px-1.5 py-1.5 text-center">
                      {mine ? (
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-indigo-600"
                          aria-label={`${p.name} at ${w.title}`}
                          checked={Boolean(seat)}
                          disabled={busy === `${p.name}|${w.id}`}
                          onChange={(e) => toggle(p, w, e.target.checked)}
                        />
                      ) : (
                        <span
                          className="text-[10.5px] font-semibold text-indigo-600"
                          title="They asked for this session through the registration form — decide it in Registrants"
                        >
                          {seat!.status === "confirmed" ? "registered" : seat!.status === "waitlist" ? "waitlisted" : "asked"}
                        </span>
                      )}
                    </td>
                  );
                })}
                <td className="px-2 py-1.5 text-right">
                  <button type="button" onClick={() => remove(p)} aria-label={`Remove ${p.name}`} className="rounded p-1 text-subtle hover:text-red-500">
                    <Trash2 size={13} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
        <input className={INPUT} placeholder="Name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        <input className={INPUT} placeholder="Email (optional)" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
        <input className={INPUT} placeholder="Dietary needs (optional)" value={draft.dietary} onChange={(e) => setDraft({ ...draft, dietary: e.target.value })}
          onKeyDown={(e) => { if (e.key === "Enter") add(); }} />
        <button type="button" onClick={add} disabled={pending}
          className="inline-flex items-center justify-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-[12.5px] font-bold text-white hover:bg-indigo-700 disabled:opacity-50">
          <Plus size={13} /> Add
        </button>
      </div>
      {said && <p role="status" className="mt-2 text-[12px] text-fg">{said}</p>}
    </section>
  );
}
