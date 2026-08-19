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

export interface SpeakerRow {
  id: string;
  fullName: string;
  title: string | null;
  organization: string | null;
  bio: string | null;
  topics: string[];
  photoUrl: string | null;
  contactEmail: string | null;
  submittedAt: string | null;
  displayOrder: number;
}

export function SpeakersManager({
  slug,
  intakeOpen,
  initialSpeakers,
}: {
  slug: string;
  intakeOpen: boolean;
  initialSpeakers: SpeakerRow[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(intakeOpen);
  const [speakers, setSpeakers] = useState(initialSpeakers);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<SpeakerRow | null>(null);

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
        {!open && (
          <p className="mt-2 text-[11.5px] text-amber-700">
            While closed the page explains that details aren’t being collected, and
            submissions are rejected.
          </p>
        )}
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
                  <textarea
                    value={editing.bio ?? ""}
                    onChange={(e) => setEditing({ ...editing, bio: e.target.value })}
                    rows={5}
                    placeholder="Bio"
                    className={INPUT}
                  />
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
                    {s.bio && <p className="mt-1.5 line-clamp-3 text-[12px] leading-relaxed text-muted">{s.bio}</p>}
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
