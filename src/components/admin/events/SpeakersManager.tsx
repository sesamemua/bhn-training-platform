"use client";

/**
 * Speaker roster for one event: the shareable intake link, an open/closed
 * switch, and the submissions as they arrive. Editing is inline — the
 * details a guest sends are usually 90% right and need a tweak, not a
 * re-entry.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, ExternalLink, Loader2, Pencil, Trash2, UserCheck } from "lucide-react";
import { countWords } from "@/lib/events/bio";
import {
  DEFAULT_LIMITS, WORD_LIMIT_MIN, WORD_LIMIT_MAX,
  type SpeakerLimits,
} from "@/lib/events/limits";
import { NotifyPanel } from "@/components/notify/NotifyPanel";

export interface SpeakerRow {
  id: string;
  fullName: string;
  title: string | null;
  organization: string | null;
  bio: string | null;
  topics: string[];
  linkedinUrl: string | null;
  sessionPitch: string | null;
  photoUrl: string | null;
  contactEmail: string | null;
  submittedAt: string | null;
  displayOrder: number;
}

export function SpeakersManager({
  slug,
  intakeOpen,
  initialSpeakers,
  limits,
  storedLimits,
}: {
  slug: string;
  intakeOpen: boolean;
  initialSpeakers: SpeakerRow[];
  /* What is in force for this event, resolved on the server. */
  limits: SpeakerLimits;
  /* What is actually stored — null where the event follows the default,
     which is what lets the input show a placeholder rather than a
     number an admin never chose. */
  storedLimits: { bio: number | null; pitch: number | null };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(intakeOpen);
  const [speakers, setSpeakers] = useState(initialSpeakers);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<SpeakerRow | null>(null);

  // Word limits. The inputs hold strings so the box can be empty —
  // empty means "follow the platform default", which is a different
  // state from any number an admin could type.
  const [inForce, setInForce] = useState<SpeakerLimits>(limits);
  const [bioLimit, setBioLimit] = useState(storedLimits.bio?.toString() ?? "");
  const [pitchLimit, setPitchLimit] = useState(storedLimits.pitch?.toString() ?? "");
  const [limitsBusy, setLimitsBusy] = useState(false);
  const [limitsNote, setLimitsNote] = useState<string | null>(null);

  async function saveLimits() {
    if (limitsBusy) return;
    setLimitsBusy(true);
    setLimitsNote(null);
    try {
      const res = await fetch(API, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "setWordLimits",
          bio: bioLimit.trim() === "" ? null : Number(bioLimit),
          pitch: pitchLimit.trim() === "" ? null : Number(pitchLimit),
        }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        limits?: SpeakerLimits;
        stored?: { speakerBioMaxWords: number | null; speakerPitchMaxWords: number | null };
        error?: string;
      };
      if (!res.ok || !j.limits) throw new Error(j.error ?? "Couldn't save.");
      setInForce(j.limits);
      // Echo back what was stored, so a number the server clamped is
      // corrected on screen instead of leaving a lie in the box.
      setBioLimit(j.stored?.speakerBioMaxWords?.toString() ?? "");
      setPitchLimit(j.stored?.speakerPitchMaxWords?.toString() ?? "");
      setLimitsNote("Saved. The form uses this from now on.");
      router.refresh();
    } catch (e) {
      setLimitsNote((e as Error).message);
    } finally {
      setLimitsBusy(false);
    }
  }

  const link = `${typeof window !== "undefined" ? window.location.origin : ""}/events/${slug}/speaker`;
  const API = `/api/admin/events/${slug}/speakers`;

  async function toggleIntake() {
    const next = !open;
    setOpen(next);
    await fetch(API, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "setIntake", open: next }),
    }).catch(() => setOpen(!next));
  }

  async function save(s: SpeakerRow) {
    setBusy(s.id);
    try {
      const res = await fetch(API, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "editSpeaker",
          speakerId: s.id,
          fullName: s.fullName,
          title: s.title,
          organization: s.organization,
          bio: s.bio,
          topics: s.topics,
        }),
      });
      if (res.ok) {
        setSpeakers((cur) => cur.map((x) => (x.id === s.id ? s : x)));
        setEditing(null);
        router.refresh();
      }
    } finally {
      setBusy(null);
    }
  }

  async function remove(s: SpeakerRow) {
    if (!confirm(`Remove ${s.fullName}? Their headshot is deleted too.`)) return;
    setSpeakers((cur) => cur.filter((x) => x.id !== s.id));
    await fetch(API, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ speakerId: s.id }),
    }).catch(() => {});
    router.refresh();
  }

  return (
    <div className="space-y-5">
      {/* The link to hand out */}
      <section className="rounded-xl border border-line bg-card-solid p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[13.5px] font-semibold text-fg">Public intake link</h2>
            <p className="text-[12px] text-fg-subtle">
              Send this to invited speakers. No login needed.
            </p>
          </div>
          <button
            onClick={toggleIntake}
            className={[
              "rounded-md px-3 py-1.5 text-[12.5px] font-semibold transition",
              open
                ? "bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                : "border border-line bg-card-solid text-muted hover:text-fg",
            ].join(" ")}
          >
            {open ? "Open — accepting" : "Closed"}
          </button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-md bg-elevated/60 px-2.5 py-1.5 text-[12px] text-brand-700">
            {link}
          </code>
          <button
            onClick={async () => {
              await navigator.clipboard.writeText(link).catch(() => {});
              setCopied(true);
              setTimeout(() => setCopied(false), 1600);
            }}
            className="inline-flex items-center gap-1 rounded-md border border-line px-2.5 py-1.5 text-[12px] font-medium text-fg hover:border-brand-400"
          >
            {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? "Copied" : "Copy"}
          </button>
          <a
            href={link}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-md border border-line px-2.5 py-1.5 text-[12px] font-medium text-fg hover:border-brand-400"
          >
            <ExternalLink size={12} /> Open
          </a>
        </div>
        {/* ── Word limits ─────────────────────────────────────── */}
        <div className="mt-3 border-t border-line pt-3">
          <h3 className="text-[12.5px] font-semibold text-fg">Word limits</h3>
          <p className="mt-0.5 text-[11.5px] leading-relaxed text-fg-subtle">
            What the speaker form counts down to, for this event. Leave a box empty to
            follow the platform default.
          </p>
          <div className="mt-2 flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                Biography
              </span>
              <input
                type="number"
                inputMode="numeric"
                min={WORD_LIMIT_MIN}
                max={WORD_LIMIT_MAX}
                value={bioLimit}
                onChange={(e) => setBioLimit(e.target.value)}
                placeholder={String(DEFAULT_LIMITS.bio)}
                className="w-24 rounded-md border border-line bg-card px-2.5 py-1.5 text-[12.5px] tabular-nums text-fg outline-none focus:border-brand-500"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                Session description
              </span>
              <input
                type="number"
                inputMode="numeric"
                min={WORD_LIMIT_MIN}
                max={WORD_LIMIT_MAX}
                value={pitchLimit}
                onChange={(e) => setPitchLimit(e.target.value)}
                placeholder={String(DEFAULT_LIMITS.pitch)}
                className="w-24 rounded-md border border-line bg-card px-2.5 py-1.5 text-[12.5px] tabular-nums text-fg outline-none focus:border-brand-500"
              />
            </label>
            <button
              onClick={saveLimits}
              disabled={limitsBusy}
              className="rounded-md bg-brand-600 px-3 py-1.5 text-[12.5px] font-semibold text-white transition hover:bg-brand-700 disabled:opacity-40"
            >
              {limitsBusy ? "Saving…" : "Save limits"}
            </button>
          </div>
          <p className="mt-1.5 text-[11.5px] text-fg-subtle">
            In force now: <span className="font-semibold tabular-nums text-fg">{inForce.bio}</span> words
            for the biography, <span className="font-semibold tabular-nums text-fg">{inForce.pitch}</span> for
            the session description. Anything between {WORD_LIMIT_MIN} and {WORD_LIMIT_MAX} is allowed.
          </p>
          {limitsNote && <p className="mt-1 text-[11.5px] text-brand-700">{limitsNote}</p>}
        </div>

        {!open && (
          <p className="mt-2 text-[11.5px] text-amber-700">
            While closed the page explains that details aren’t being collected, and
            submissions are rejected.
          </p>
        )}
        <div className="mt-3 border-t border-line pt-3">
          {/* The links and the wording live in the notify register, so
              this page does not restate them and cannot drift from what
              is actually sent. */}
<NotifyPanel feature="speaker-intake" context={slug} />
        </div>
      </section>

      {/* Roster */}
      {speakers.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line px-5 py-10 text-center text-[13px] text-muted">
          No speakers yet. Open the link above and send it to your invitees.
        </p>
      ) : (
        <ul className="space-y-2">
          {speakers.map((s) => (
            <li key={s.id} className="rounded-xl border border-line bg-card-solid p-4">
              {editing?.id === s.id ? (
                <div className="space-y-2">
                  <input
                    value={editing.fullName}
                    onChange={(e) => setEditing({ ...editing, fullName: e.target.value })}
                    className={INPUT}
                  />
                  <div className="grid gap-2 sm:grid-cols-2">
                    <input
                      value={editing.title ?? ""}
                      onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                      placeholder="Title"
                      className={INPUT}
                    />
                    <input
                      value={editing.organization ?? ""}
                      onChange={(e) => setEditing({ ...editing, organization: e.target.value })}
                      placeholder="Organisation"
                      className={INPUT}
                    />
                  </div>
                  <div>
                    <textarea
                      value={editing.bio ?? ""}
                      onChange={(e) => setEditing({ ...editing, bio: e.target.value })}
                      rows={12}
                      placeholder="Bio"
                      className={INPUT}
                    />
                    {/* The save route rejects over-long bios. Without this
                        counter that arrives as a bare 400 after the click. */}
                    <p
                      className={`mt-1 text-[11px] font-medium ${
                        countWords(editing.bio ?? "") > inForce.bio ? "text-red-600" : "text-fg-subtle"
                      }`}
                    >
                      {countWords(editing.bio ?? "")} / {inForce.bio} words
                    </p>
                  </div>
                  <input
                    value={editing.topics.join(", ")}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        topics: e.target.value.split(",").map((t) => t.trim()).filter(Boolean),
                      })
                    }
                    placeholder="Topics, comma separated"
                    className={INPUT}
                  />
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setEditing(null)} className="rounded-md border border-line px-3 py-1.5 text-[12px] font-medium text-fg">
                      Cancel
                    </button>
                    <button
                      onClick={() => save(editing)}
                      disabled={busy === s.id}
                      className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-1.5 text-[12px] font-bold text-white hover:bg-brand-700 disabled:opacity-50"
                    >
                      {busy === s.id ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Save
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-3">
                  {s.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- R2 URL, no loader configured
                    <img src={s.photoUrl} alt="" className="h-14 w-14 shrink-0 rounded-full object-cover" />
                  ) : (
                    <span className="h-14 w-14 shrink-0 rounded-full bg-elevated" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-[14px] font-semibold text-fg">
                      {s.fullName}
                      {s.submittedAt && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-800">
                          <UserCheck size={9} /> self-submitted
                        </span>
                      )}
                    </p>
                    <p className="text-[12.5px] text-muted">
                      {[s.title, s.organization].filter(Boolean).join(" · ") || "—"}
                    </p>
                    {s.topics.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {s.topics.map((t) => (
                          <span key={t} className="rounded-full bg-elevated px-2 py-0.5 text-[10.5px] text-fg-subtle">
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                    {/* Bios run to 250 words now, so the list shows the
                        opening and opens on demand — a roster of ten
                        speakers is a roster, not an essay collection. */}
                    {s.bio && (
                      <details className="group mt-1.5">
                        <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                          <span className="block whitespace-pre-line text-[12px] leading-relaxed text-muted line-clamp-3 group-open:line-clamp-none">
                            {s.bio}
                          </span>
                          {countWords(s.bio) > 40 && (
                            <>
                              <span className="mt-1 block text-[10.5px] font-semibold text-brand-600 group-open:hidden">
                                Read all {countWords(s.bio)} words
                              </span>
                              <span className="mt-1 hidden text-[10.5px] font-semibold text-brand-600 group-open:block">
                                Show less
                              </span>
                            </>
                          )}
                        </summary>
                      </details>
                    )}
                    {s.sessionPitch && (
                      <p className="mt-1.5 rounded-md bg-elevated/60 px-2 py-1.5 text-[11.5px] leading-relaxed text-fg-subtle">
                        <span className="font-semibold text-fg">Session: </span>{s.sessionPitch}
                      </p>
                    )}
                    {s.linkedinUrl && (
                      <a href={s.linkedinUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-[11px] font-medium text-brand-700 hover:underline">
                        LinkedIn profile
                      </a>
                    )}
                    {s.contactEmail && <p className="mt-1 text-[11px] text-subtle">{s.contactEmail}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button onClick={() => setEditing(s)} title="Edit" className="rounded-md border border-line p-1.5 text-fg-muted hover:text-fg">
                      <Pencil size={13} />
                    </button>
                    <button onClick={() => remove(s)} title="Remove" className="rounded-md border border-line p-1.5 text-fg-muted hover:border-rose-300 hover:text-rose-600">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const INPUT =
  "w-full rounded-md border border-line bg-card-solid px-2.5 py-1.5 text-[13px] text-fg outline-none focus:border-brand-400";
