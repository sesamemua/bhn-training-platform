"use client";
/**
 * The Brain Picker board.
 *
 * Reads top to bottom as an accusation: first what you have asked of
 * everyone, then the people you asked, then what is still outstanding.
 * Every joke here points at the person holding the mouse — the
 * colleagues listed are real and can open this page, so the page never
 * scores them, only their availability.
 *
 * All the copy that makes a judgement lives in src/lib/brain/picker.ts,
 * so it is unit-tested and cannot say one thing here and another in a
 * verdict line.
 */
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Brain, Coffee, Check, X, Loader2, Send, Pencil, ExternalLink,
  HandCoins, Inbox, Users2, Sparkles, CheckSquare, Mail,
} from "lucide-react";
import { DSSection } from "@/components/design-system/DSSection";
import {
  BRIEFS, KIND_LABEL, NOTHING, audacity, ledger, probeVerdict, reciprocity,
  type Brief, type PickKind,
} from "@/lib/brain/picker";
import { askerTotals, outstanding, pickable, waitingOnYou, type Colleague, type PickRow } from "@/lib/brain/team";
import { cn } from "@/lib/utils";

/** Picks arrive over the wire, so their dates are strings again. */
type WirePick = Omit<PickRow, "createdAt" | "answeredAt"> & {
  createdAt: string | Date;
  answeredAt: string | Date | null;
  /** When the email went out. Null = nobody has been emailed about it. */
  notifiedAt?: string | Date | null;
};

export function BrainPicker({
  team, picks, viewerId, evidence, nothing = NOTHING,
}: {
  team: Colleague[];
  picks: WirePick[];
  viewerId: string;
  /** probe id → userId → how much they actually did. The probes' evidence. */
  evidence: Record<string, Record<string, number>>;
  nothing?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  // One selection drives everything. Asking one person is a set of one,
  // asking the team is a set of six — the route takes a list either way,
  // so there is no separate "broadcast" path to drift.
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Colleague | null>(null);
  const [flash, setFlash] = useState("");
  // Nothing emails itself. This holds the exact list a send would go to,
  // shown for approval before any of it leaves the building.
  const [outbox, setOutbox] = useState<{ id: string; to: string; name: string; subject: string }[] | null>(null);
  const [mailReady, setMailReady] = useState(true);

  const rows = useMemo<PickRow[]>(
    () => picks.map((p) => ({
      ...p,
      createdAt: new Date(p.createdAt),
      answeredAt: p.answeredAt ? new Date(p.answeredAt) : null,
      notifiedAt: p.notifiedAt ? new Date(p.notifiedAt) : null,
    })),
    [picks],
  );

  const totals = useMemo(() => askerTotals(rows, viewerId, nothing), [rows, viewerId, nothing]);
  const meter = useMemo(() => audacity(totals), [totals]);
  const open = useMemo(() => outstanding(rows, viewerId), [rows, viewerId]);
  const yours = useMemo(() => waitingOnYou(rows, viewerId), [rows, viewerId]);
  const others = useMemo(() => pickable(team), [team]);
  const nameOf = (id: string) => team.find((c) => c.id === id);

  const chosenPeople = others.filter((c) => chosen.has(c.id));
  /** Your asks that nobody has been emailed about. Creating one never sends. */
  const unsent = rows.filter((p) => p.askedById === viewerId && !p.notifiedAt);
  /** Which briefs you have already sent, so the page can say so. */
  const sentProbes = new Set(
    rows.filter((p) => p.askedById === viewerId && p.probe).map((p) => p.probe as string),
  );

  const toggleChosen = (id: string) =>
    setChosen((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  const openFor = (ids: string[]) => { setChosen(new Set(ids)); setFormOpen(true); };

  async function send(path: string, method: string, body?: unknown, note?: string) {
    setBusy(path);
    try {
      const res = await fetch(path, {
        method,
        ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
      });
      if (res.ok) {
        if (note) { setFlash(note); window.setTimeout(() => setFlash(""), 5000); }
        router.refresh();
        return true;
      }
      const j = await res.json().catch(() => ({}));
      setFlash(j.error ?? "That did not work.");
      return false;
    } catch {
      setFlash("That did not work.");
      return false;
    } finally {
      setBusy(null);
    }
  }

  /** Fire a prewritten brief at everybody, or load it for a chosen few. */
  /** Ask the server who WOULD be emailed. Sends nothing. */
  async function reviewOutbox() {
    setBusy("outbox");
    try {
      const res = await fetch("/api/admin/brain/notify");
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setFlash(j.error ?? "Could not check the outbox."); return; }
      setMailReady(!!j.mailConfigured);
      setOutbox(j.pending ?? []);
    } catch {
      setFlash("Could not check the outbox.");
    } finally {
      setBusy(null);
    }
  }

  /** The only call in this component that puts email on the wire. */
  async function sendOutbox() {
    if (!outbox?.length) return;
    const ok = await send("/api/admin/brain/notify", "POST", { ids: outbox.map((o) => o.id) });
    if (ok) {
      setFlash(`Emailed ${outbox.length === 1 ? "1 person" : `${outbox.length} people`}.`);
      setOutbox(null);
    }
  }

  const sendBrief = (brief: Brief, ids: string[]) =>
    send(
      "/api/admin/brain/picks", "POST",
      { subject: brief.subject, body: brief.body, kind: brief.kind, href: brief.href, probe: brief.probe, bribe: brief.bribe, askedOfIds: ids },
      ids.length === 1
        ? `Sent to one person.`
        : `Sent to ${ids.length} people. You have now promised ${ids.length} coffees.`,
    );

  return (
    <div className="space-y-5">
      {flash && (
        <p role="status" className="rounded-xl bg-brand-50 px-4 py-2.5 text-xs font-semibold text-brand-900 ring-1 ring-inset ring-brand-200">
          {flash}
        </p>
      )}

      {/* ── The mirror. You, before anybody else. ───────────────── */}
      <section className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-[240px] flex-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700">Your standing</p>
            <p className="mt-1 text-2xl font-bold text-fg">{meter.label}</p>
            <p className="mt-1 max-w-prose text-[12.5px] leading-relaxed text-muted">{meter.verdict}</p>
            <p className="mt-1 max-w-prose text-[12.5px] leading-relaxed text-muted">{reciprocity(totals)}</p>
          </div>
          <div className="w-full max-w-xs">
            <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-amber-700">
              <span>Audacity</span><span className="tabular-nums">{meter.score}/100</span>
            </div>
            <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-amber-200/70">
              <div
                className="h-full rounded-full bg-amber-500 transition-[width] duration-500"
                style={{ width: `${Math.max(3, meter.score)}%` }}
                role="meter"
                aria-valuenow={meter.score}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Audacity"
              />
            </div>
            <p className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-medium text-amber-900">
              <HandCoins size={12} /> {ledger(totals)}
            </p>
            <p className="mt-1 inline-flex items-center gap-1.5 text-[11px] text-amber-800/80">
              <Coffee size={12} /> Coffees actually bought: {totals.delivered}. This page cannot record one,
              which is the most accurate thing about it.
            </p>
          </div>
        </div>
      </section>

      {/* ── Nothing has been emailed until you say so ───────────── */}
      {unsent.length > 0 && (
        <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-300 bg-amber-50/60 p-4">
          <Mail size={16} className="shrink-0 text-amber-700" aria-hidden />
          <div className="min-w-[220px] flex-1">
            <p className="text-sm font-bold text-fg">
              {unsent.length === 1 ? "One ask has not been emailed" : `${unsent.length} asks have not been emailed`}
            </p>
            <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted">
              Sending an ask does not email anybody. It sits on their Brain Picker page until you send it —
              and several colleagues have not signed in for weeks, so until you do, it may not be seen at all.
            </p>
          </div>
          <button
            onClick={reviewOutbox}
            disabled={busy !== null}
            className="inline-flex h-9 items-center gap-2 rounded-xl bg-amber-500 px-4 text-xs font-bold text-amber-950 hover:bg-amber-400 disabled:opacity-50"
          >
            {busy === "outbox" ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
            Review and send
          </button>
        </section>
      )}

      {/* ── Prewritten briefs ───────────────────────────────────── */}
      <section className="space-y-3 rounded-2xl border border-line bg-card p-4">
        <div>
          <p className="text-sm font-bold text-fg">Ready to send</p>
          <p className="mt-0.5 text-[12.5px] text-muted">
            The things that actually need eyes, already written. Send one to everybody, or tick a few
            people below and send it to just them.
          </p>
        </div>
        <ul className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          {BRIEFS.map((brief) => {
            const already = brief.probe ? sentProbes.has(brief.probe) : false;
            return (
              <li key={brief.id} className="flex h-full flex-col rounded-xl border border-line bg-elevated p-3">
                <p className="text-[12.5px] font-bold text-fg">{brief.label}</p>
                <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted">{brief.blurb}</p>
                {already && (
                  <p className="mt-1 text-[10.5px] font-semibold text-amber-700">You have sent this one already.</p>
                )}
                <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-2.5">
                  <button
                    onClick={() => sendBrief(brief, others.map((c) => c.id))}
                    disabled={busy !== null || others.length === 0}
                    className="inline-flex h-7 items-center gap-1.5 rounded-lg bg-brand-600 px-2.5 text-[11px] font-bold text-white hover:bg-brand-700 disabled:opacity-50"
                  >
                    {busy !== null ? <Loader2 size={12} className="animate-spin" /> : <Users2 size={12} />}
                    Ask all {others.length}
                  </button>
                  <button
                    onClick={() => sendBrief(brief, chosenPeople.map((c) => c.id))}
                    disabled={busy !== null || chosenPeople.length === 0}
                    title={chosenPeople.length === 0 ? "Tick some people below first" : undefined}
                    className="inline-flex h-7 items-center rounded-lg px-2.5 text-[11px] font-semibold text-muted ring-1 ring-inset ring-line hover:bg-raised hover:text-fg disabled:opacity-40"
                  >
                    {chosenPeople.length > 0 ? `Ask the ${chosenPeople.length} selected` : "Ask selected"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
        <button
          onClick={() => openFor(others.map((c) => c.id))}
          disabled={busy !== null || others.length === 0}
          className="text-[11px] font-semibold text-brand-700 hover:underline disabled:opacity-50"
        >
          Or write your own →
        </button>
      </section>

      {/* ── Waiting on you ──────────────────────────────────────── */}
      {yours.length > 0 && (
        <DSSection title="Somebody wants something from you" eyebrow="Turnabout" icon={<Inbox size={16} />}>
          <ul className="divide-y divide-line">
            {yours.map((p) => (
              <li key={p.id} className="py-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-subtle">
                  {KIND_LABEL[(p.kind as PickKind)] ?? "A question"} from {nameOf(p.askedById)?.firstName ?? "a colleague"}
                  {p.bribe.trim().toLowerCase() !== nothing
                    ? ` · offering ${p.bribe}`
                    : " · offering nothing"}
                </p>
                <p className="mt-0.5 text-sm font-semibold text-fg">{p.subject}</p>
                <p className="mt-0.5 whitespace-pre-line text-xs leading-relaxed text-muted">{p.body}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {p.href && (
                    <Link
                      href={p.href}
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-brand-700 hover:underline"
                    >
                      Open the thing <ExternalLink size={11} />
                    </Link>
                  )}
                  <button
                    onClick={() => send(`/api/admin/brain/picks/${p.id}`, "PATCH", { status: "answered" }, "Marked as done. Await your coffee.")}
                    disabled={busy !== null}
                    className="inline-flex h-7 items-center gap-1 rounded-lg bg-emerald-600 px-2.5 text-[11px] font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    <Check size={12} /> Done
                  </button>
                  <button
                    onClick={() => send(`/api/admin/brain/picks/${p.id}`, "PATCH", { status: "declined" }, "Declined. Bold.")}
                    disabled={busy !== null}
                    className="inline-flex h-7 items-center gap-1 rounded-lg px-2.5 text-[11px] font-semibold text-muted ring-1 ring-inset ring-line hover:bg-elevated disabled:opacity-50"
                  >
                    <X size={12} /> Decline
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </DSSection>
      )}

      {/* ── The team ────────────────────────────────────────────── */}
      <DSSection
        title="Whose brain"
        eyebrow="The team"
        icon={<Brain size={16} />}
      >
        {/* Tick several and ask them all the same thing at once. The bar
            only appears once something is ticked, so the page is not
            permanently carrying an empty toolbar. */}
        <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px]">
          {chosen.size > 0 ? (
            <>
              <span className="font-bold text-brand-800">
                {chosen.size} selected
              </span>
              <button
                onClick={() => setFormOpen(true)}
                className="inline-flex h-7 items-center gap-1.5 rounded-lg bg-brand-600 px-2.5 text-[11px] font-bold text-white hover:bg-brand-700"
              >
                <Brain size={12} /> Pick {chosen.size === 1 ? "that brain" : `these ${chosen.size} brains`}
              </button>
              <button onClick={() => setChosen(new Set())} className="font-semibold text-muted hover:text-fg">
                Clear
              </button>
            </>
          ) : (
            <>
              <span className="text-subtle">Tick a few to ask them the same thing at once.</span>
              <button
                onClick={() => setChosen(new Set(others.map((c) => c.id)))}
                className="inline-flex items-center gap-1 font-semibold text-brand-700 hover:underline"
              >
                <CheckSquare size={12} /> Select everybody
              </button>
            </>
          )}
        </div>
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {team.map((c) => (
            <li key={c.id}>
              <article className={cn(
                "flex h-full flex-col rounded-2xl border bg-card p-4",
                c.isYou ? "border-dashed border-line" : "border-line",
              )}>
                <div className="flex items-start gap-3">
                  <span
                    aria-hidden
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-100 text-[13px] font-bold text-brand-800"
                  >
                    {c.initials}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-fg">
                      {c.name}{c.isYou && <span className="ml-1 font-normal text-subtle">(you)</span>}
                    </p>
                    <p className="truncate font-mono text-[10px] text-subtle">{c.rate}</p>
                  </div>
                  {!c.isYou && (
                    <label className="shrink-0 cursor-pointer p-1" title={`Include ${c.firstName} in a group ask`}>
                      <input
                        type="checkbox"
                        checked={chosen.has(c.id)}
                        onChange={() => toggleChosen(c.id)}
                        aria-label={`Include ${c.name} in a group ask`}
                        className="rounded border-line"
                      />
                    </label>
                  )}
                  <button
                    onClick={() => setEditing(c)}
                    aria-label={`Edit what ${c.firstName} is good at`}
                    className="shrink-0 text-subtle hover:text-fg"
                  >
                    <Pencil size={13} />
                  </button>
                </div>

                <p className="mt-2.5 text-xs leading-relaxed text-muted">{c.speciality}</p>
                {c.specialityIsGuess && (
                  <p className="mt-1 text-[10.5px] font-medium text-amber-700">
                    {c.specialitySource
                      ? `Title from ${c.specialitySource} — what the org says they do, not what they are like. Edit if it is wrong.`
                      : "Nobody has filled this in. Which is its own kind of answer."}
                  </p>
                )}

                <p className="mt-2 text-[11px] text-subtle">
                  {c.isYou
                    ? "You cannot pick your own brain. That is just thinking."
                    : c.pickedByYou === 0
                      ? "You have never asked them for anything."
                      : `You have asked ${c.pickedByYou}× · ${c.answeredForYou} came back${c.openFromYou ? ` · ${c.openFromYou} still open` : ""}`}
                </p>

                {!c.isYou && (
                  <button
                    onClick={() => openFor([c.id])}
                    className="mt-auto inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-elevated pt-0 text-xs font-bold text-fg ring-1 ring-inset ring-line hover:bg-raised"
                  >
                    <Brain size={13} /> Pick {c.firstName}&apos;s brain
                  </button>
                )}
              </article>
            </li>
          ))}
        </ul>
      </DSSection>

      {/* ── Outstanding ─────────────────────────────────────────── */}
      {open.length > 0 && (
        <DSSection title="Still waiting" eyebrow={`${open.length} outstanding`} icon={<Send size={16} />}>
          <ul className="divide-y divide-line">
            {open.map((p) => {
              const who = nameOf(p.askedOfId);
              const done = p.probe ? evidence[p.probe]?.[p.askedOfId] ?? 0 : 0;
              const verdict = probeVerdict(p.probe, done, "open", who?.firstName ?? "They");
              return (
                <li key={p.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 py-2.5">
                  <div className="min-w-[220px] flex-1">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-subtle">
                      {who?.name ?? "Somebody"} · asked{" "}
                      {new Date(p.createdAt).toLocaleDateString("en-GB", { timeZone: "America/Toronto", day: "numeric", month: "short" })}
                      {p.bribe.trim().toLowerCase() !== nothing && ` · you promised ${p.bribe}`}
                    </p>
                    <p className="text-sm text-fg">{p.subject}</p>
                    {verdict && <p className="mt-0.5 text-[11.5px] font-medium text-amber-700">{verdict}</p>}
                  </div>
                  <button
                    onClick={() => send(`/api/admin/brain/picks/${p.id}`, "DELETE", undefined, "Withdrawn. Rare.")}
                    disabled={busy !== null}
                    className="text-[11px] font-semibold text-muted hover:text-fg disabled:opacity-50"
                  >
                    Withdraw
                  </button>
                </li>
              );
            })}
          </ul>
        </DSSection>
      )}

      {formOpen && chosenPeople.length > 0 && (
        <PickForm
          recipients={chosenPeople}
          busy={busy !== null}
          nothing={nothing}
          onClose={() => setFormOpen(false)}
          onSend={async (payload) => {
            const ok = await send(
              "/api/admin/brain/picks", "POST",
              { ...payload, askedOfIds: chosenPeople.map((c) => c.id) },
              chosenPeople.length === 1
                ? `Asked ${chosenPeople[0].firstName}. You offered ${payload.bribe || "nothing"}.`
                : `Asked ${chosenPeople.length} people the same thing. Efficient.`,
            );
            if (ok) { setFormOpen(false); setChosen(new Set()); }
          }}
        />
      )}

      {outbox !== null && (
        <Sheet
          title={outbox.length === 0 ? "Nothing to send" : `Email ${outbox.length === 1 ? "1 person" : `${outbox.length} people`}?`}
          subtitle={outbox.length === 0
            ? "Every ask you have made has already been emailed."
            : "These messages go out the moment you press send. Nothing has been sent yet."}
          onClose={() => setOutbox(null)}
        >
          {!mailReady && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-800 ring-1 ring-inset ring-rose-200">
              Email is not configured on this environment, so nothing can be sent from here.
            </p>
          )}
          {outbox.length > 0 && (
            <ul className="divide-y divide-line rounded-lg border border-line">
              {outbox.map((o) => (
                <li key={o.id} className="px-3 py-2">
                  <p className="text-[12px] font-semibold text-fg">{o.name}</p>
                  <p className="font-mono text-[10.5px] text-subtle">{o.to}</p>
                  <p className="mt-0.5 text-[11.5px] text-muted">{o.subject}</p>
                </li>
              ))}
            </ul>
          )}
          {outbox.length > 0 && (
            <>
              <p className="text-[11px] text-subtle">
                Replies come back to you, not to the platform.
              </p>
              <button
                onClick={sendOutbox}
                disabled={busy !== null || !mailReady}
                className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-brand-600 text-xs font-bold text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {busy !== null ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                Send {outbox.length === 1 ? "it" : `all ${outbox.length}`} now
              </button>
            </>
          )}
        </Sheet>
      )}

      {editing && (
        <EditForm
          colleague={editing}
          busy={busy !== null}
          onClose={() => setEditing(null)}
          onSave={async (speciality, rate) => {
            const ok = await send(`/api/admin/brain/profiles/${editing.id}`, "PUT", { speciality, rate },
              "Updated. No longer a guess.");
            if (ok) setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function Sheet({ title, subtitle, onClose, children }: {
  title: string; subtitle: string; onClose: () => void; children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-line bg-card p-5 sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-fg">{title}</h2>
            <p className="mt-0.5 text-xs text-muted">{subtitle}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-subtle hover:text-fg"><X size={16} /></button>
        </div>
        <div className="mt-4 space-y-3">{children}</div>
      </div>
    </div>
  );
}

const FIELD =
  "w-full rounded-lg border border-line bg-card px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500/40";

function PickForm({ recipients, busy, nothing, onClose, onSend }: {
  recipients: Colleague[];
  busy: boolean;
  nothing: string;
  onClose: () => void;
  onSend: (payload: { subject: string; body: string; kind: PickKind; href?: string; bribe: string }) => void;
}) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [kind, setKind] = useState<PickKind>("question");
  const [href, setHref] = useState("");
  const [bribe, setBribe] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [aiNote, setAiNote] = useState("");

  const many = recipients.length > 1;
  const who = many ? `${recipients.length} people` : recipients[0].firstName;

  /**
   * Ask the AI for a draft. It gets who you are asking and what they do,
   * plus whatever you have already typed — so "make it better" works as
   * well as "write it from nothing". Its brief is to make the request
   * cheap to answer, not to make it sound nice.
   */
  async function draft() {
    setDrafting(true); setAiNote("");
    try {
      const res = await fetch("/api/admin/brain/assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          askedOfIds: recipients.map((c) => c.id),
          kind, gist: body, subject, bribe: bribe.trim() || nothing,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setAiNote(j.error ?? "The AI could not help just now."); return; }
      setSubject(j.draft.subject);
      setBody(j.draft.body);
      setAiNote(
        j.weakSubject
          ? "Drafted — but that subject says nothing. Name the actual thing before you send it."
          : "Drafted. Read it before you send it — it is your name on it.",
      );
    } catch {
      setAiNote("The AI could not help just now.");
    } finally {
      setDrafting(false);
    }
  }

  return (
    <Sheet
      title={many ? `Pick ${recipients.length} brains at once` : `Pick ${recipients[0].firstName}'s brain`}
      subtitle={many
        ? recipients.map((c) => c.firstName).join(", ")
        : recipients[0].speciality}
      onClose={onClose}
    >
      <label className="block text-[11px] font-semibold text-fg">
        What is it
        <select value={kind} onChange={(e) => setKind(e.target.value as PickKind)} className={`mt-1 ${FIELD}`}>
          <option value="question">A question — you want an opinion</option>
          <option value="task">A task — you want work done</option>
          <option value="favour">A favour — you know what this is</option>
        </select>
      </label>

      {/* The writing aid. It reads what you have so far, so it works both
          as "write this for me" and as "tidy up what I typed". */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-line px-2.5 py-2">
        <button
          onClick={draft}
          disabled={busy || drafting}
          className="inline-flex h-7 items-center gap-1.5 rounded-lg bg-elevated px-2.5 text-[11px] font-bold text-fg ring-1 ring-inset ring-line hover:bg-raised disabled:opacity-50"
        >
          {drafting ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
          {body.trim() || subject.trim() ? "Improve what I wrote" : "Write it for me"}
        </button>
        <span className="text-[10.5px] text-subtle">
          Uses what {many ? "they" : recipients[0].firstName} works on. Aims to make it quick to answer.
        </span>
        {aiNote && <span className="basis-full text-[10.5px] font-medium text-amber-700">{aiNote}</span>}
      </div>

      <label className="block text-[11px] font-semibold text-fg">
        Subject
        <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Quick one — should be five minutes"
          className={`mt-1 ${FIELD}`} />
      </label>
      <label className="block text-[11px] font-semibold text-fg">
        What you actually want
        <textarea rows={6} value={body} onChange={(e) => setBody(e.target.value)}
          placeholder="Be specific. Vagueness is how five minutes becomes an afternoon."
          className={`mt-1 ${FIELD}`} />
      </label>
      <label className="block text-[11px] font-semibold text-fg">
        A link to the thing <span className="font-normal text-subtle">optional</span>
        <input value={href} onChange={(e) => setHref(e.target.value)} placeholder="/admin/workspace/merch" className={`mt-1 ${FIELD}`} />
      </label>
      <label className="block text-[11px] font-semibold text-fg">
        What you are offering in return
        <input value={bribe} onChange={(e) => setBribe(e.target.value)} placeholder="a coffee, eventually" className={`mt-1 ${FIELD}`} />
        <span className="mt-1 block text-[10.5px] font-normal text-subtle">
          Leave it empty and the page will record, accurately, that you offered {nothing}
          {many && ` — ${recipients.length} times over`}.
        </span>
      </label>
      <button
        onClick={() => onSend({ subject, body, kind, href: href.trim() || undefined, bribe: bribe.trim() || nothing })}
        disabled={busy || drafting || subject.trim().length < 2 || body.trim().length < 2}
        className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-brand-600 text-xs font-bold text-white hover:bg-brand-700 disabled:opacity-50"
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
        Ask {who}
      </button>
    </Sheet>
  );
}

function EditForm({ colleague, busy, onClose, onSave }: {
  colleague: Colleague; busy: boolean; onClose: () => void;
  onSave: (speciality: string, rate: string) => void;
}) {
  const [speciality, setSpeciality] = useState(colleague.speciality);
  const [rate, setRate] = useState(colleague.rate);
  return (
    <Sheet
      title={`What is ${colleague.firstName} good at?`}
      subtitle={!colleague.specialityIsGuess
        ? "Somebody has already written this. You can still improve it."
        : colleague.specialitySource
          ? `Currently their title from ${colleague.specialitySource}. Say what they are actually worth interrupting for.`
          : "Nothing here yet. Say what they are worth interrupting for."}
      onClose={onClose}
    >
      <label className="block text-[11px] font-semibold text-fg">
        Worth interrupting for
        <textarea rows={3} value={speciality} onChange={(e) => setSpeciality(e.target.value)} className={`mt-1 ${FIELD}`} />
      </label>
      <label className="block text-[11px] font-semibold text-fg">
        What they charge
        <input value={rate} onChange={(e) => setRate(e.target.value)} className={`mt-1 ${FIELD}`} />
      </label>
      <button
        onClick={() => onSave(speciality.trim(), rate.trim())}
        disabled={busy || speciality.trim().length < 2}
        className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-brand-600 text-xs font-bold text-white hover:bg-brand-700 disabled:opacity-50"
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Save
      </button>
    </Sheet>
  );
}
