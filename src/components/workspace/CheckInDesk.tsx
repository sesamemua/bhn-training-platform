"use client";

/**
 * The door. Pick the session you are running, then either scan passes
 * with the phone's camera or work down the list on a laptop.
 *
 * Both modes send the same request and get the same answer — the rules
 * live in lib/training-week/check-in.ts — so a laptop at the desk and
 * two phones at the doors cannot disagree about who is in. The list is
 * the fail-safe: no camera, a dead phone, a pass nobody can find, or a
 * scanner that will not read, and the desk carries on by name.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import jsQR from "jsqr";
import { Camera, Check, Laptop, Loader2, RotateCcw, Search, Undo2, X } from "lucide-react";
import { VERDICT_COPY, type DoorVerdict } from "@/lib/training-week/check-in";

export interface DeskSession {
  id: string;
  title: string;
  start: string;
  end: string;
  capacity: number;
  location: string | null;
}

interface Card {
  verdict: DoorVerdict;
  name: string;
  email: string;
  status: string | null;
  checkedInAt: string | null;
  bookingId: string | null;
  otherSessions: { title: string; when: string; status: string }[];
  room: { checkedIn: number; capacity: number };
}

interface Row {
  bookingId: string;
  name: string;
  email: string;
  status: string;
  checkedInAt: string | null;
  method: string | null;
}

const tz = "America/Toronto";
const clock = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(new Date(iso));
const dayShort = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, weekday: "short", day: "numeric", month: "short" }).format(new Date(iso));

const TONE: Record<string, string> = {
  green: "border-emerald-500 bg-emerald-50 text-emerald-900",
  amber: "border-amber-500 bg-amber-50 text-amber-900",
  red: "border-rose-500 bg-rose-50 text-rose-900",
  grey: "border-slate-400 bg-slate-50 text-slate-800",
};
const SEAT_LABEL: Record<string, string> = { confirmed: "Approved", waitlist: "Waitlisted", pending: "Not decided", cancelled: "Declined" };
const SEAT_TONE: Record<string, string> = {
  confirmed: "bg-emerald-500/12 text-emerald-700",
  waitlist: "bg-amber-500/12 text-amber-700",
  pending: "bg-slate-500/10 text-slate-600",
  cancelled: "bg-rose-500/10 text-rose-700",
};

/** A short sound and a buzz, so the door does not have to look at the screen. */
function signal(ok: boolean) {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = ok ? 880 : 220;
    g.gain.value = 0.08;
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + (ok ? 0.12 : 0.35));
    navigator.vibrate?.(ok ? 60 : [80, 60, 80]);
  } catch { /* silence is fine */ }
}

export function CheckInDesk({ sessions, initialId }: { sessions: DeskSession[]; initialId: string | null }) {
  const [sessionId, setSessionId] = useState(initialId ?? sessions[0]?.id ?? "");
  const [mode, setMode] = useState<"scan" | "list">("list");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [room, setRoom] = useState<{ checkedIn: number; capacity: number } | null>(null);
  const [card, setCard] = useState<Card | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const session = sessions.find((s) => s.id === sessionId) ?? null;

  // Phones open on the camera, laptops on the list. Decided after mount:
  // the server cannot know which it is talking to.
  useEffect(() => {
    if (window.matchMedia("(max-width: 900px)").matches) setMode("scan");
  }, []);

  const load = useCallback(async () => {
    if (!sessionId) return;
    const r = await fetch(`/api/admin/training-week/check-in?workshopId=${encodeURIComponent(sessionId)}`, { cache: "no-store" });
    const j = (await r.json().catch(() => ({}))) as { rows?: Row[]; room?: { checkedIn: number; capacity: number }; error?: string };
    if (!r.ok) { setProblem(j.error ?? "Could not load the list."); return; }
    setRows(j.rows ?? []);
    setRoom(j.room ?? null);
    setProblem(null);
  }, [sessionId]);

  // Other devices check people in too: keep the list and the count honest.
  useEffect(() => {
    setRows(null);
    setCard(null);
    void load();
    const t = setInterval(() => { void load(); }, 10_000);
    return () => clearInterval(t);
  }, [load]);

  async function send(body: Record<string, unknown>, key: string): Promise<Card | null> {
    setBusy(key);
    try {
      const r = await fetch("/api/admin/training-week/check-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workshopId: sessionId, ...body }),
      });
      const j = (await r.json().catch(() => ({}))) as { card?: Card; room?: { checkedIn: number; capacity: number }; error?: string };
      if (!r.ok) { setProblem(j.error ?? "That did not go through — check the connection."); signal(false); return null; }
      setProblem(null);
      if (j.room) setRoom(j.room);
      if (j.card) {
        setRoom(j.card.room);
        setCard(j.card);
        signal(j.card.verdict === "checked_in");
      }
      void load();
      return j.card ?? null;
    } catch {
      setProblem("No connection. Keep a paper note of who came in and add them from the list when it is back.");
      signal(false);
      return null;
    } finally {
      setBusy(null);
    }
  }

  const onScan = useCallback((raw: string) => { void send({ token: raw }, "scan"); }, [sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-4">
      {/* Which door this is. */}
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-line bg-card p-3">
        <label className="min-w-[16rem] flex-1">
          <span className="text-[11px] font-bold uppercase tracking-wide text-subtle">Session at this door</span>
          <select
            value={sessionId}
            onChange={(e) => setSessionId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-line bg-elevated px-2.5 py-2 text-[14px] font-semibold text-fg"
          >
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {dayShort(s.start)} {clock(s.start)} · {s.title}
              </option>
            ))}
          </select>
        </label>
        <div className="inline-flex overflow-hidden rounded-lg border border-line" role="group" aria-label="Check-in mode">
          {([["scan", "Scan passes", Camera], ["list", "List (laptop)", Laptop]] as const).map(([m, label, Icon]) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              aria-pressed={mode === m}
              className={`inline-flex items-center gap-1.5 px-3 py-2 text-[13px] font-semibold ${mode === m ? "bg-brand-600 text-white" : "text-muted hover:bg-elevated"}`}
            >
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>
      </div>

      {session && room && <RoomBar session={session} room={room} rows={rows} />}

      {problem && (
        <p role="alert" className="rounded-lg border border-rose-400 bg-rose-50 px-3 py-2 text-[13px] font-semibold text-rose-800">{problem}</p>
      )}

      {card && (
        <ResultCard
          card={card}
          busy={busy !== null}
          onLetIn={() => card.bookingId && void send({ bookingId: card.bookingId, letIn: true }, "letin")}
          onClose={() => setCard(null)}
        />
      )}

      {mode === "scan" ? (
        <Scanner onToken={onScan} paused={busy !== null} />
      ) : (
        <RosterList
          rows={rows}
          room={room}
          busy={busy}
          onCheckIn={(r, letIn) => void send({ bookingId: r.bookingId, letIn }, r.bookingId)}
          onUndo={(r) => {
            if (!confirm(`Take back ${r.name}'s check-in?`)) return;
            void send({ bookingId: r.bookingId, undo: true }, r.bookingId);
          }}
        />
      )}
    </div>
  );
}

function RoomBar({ session, room, rows }: { session: DeskSession; room: { checkedIn: number; capacity: number }; rows: Row[] | null }) {
  const approved = (rows ?? []).filter((r) => r.status === "confirmed").length;
  const approvedIn = (rows ?? []).filter((r) => r.status === "confirmed" && r.checkedInAt).length;
  const pct = room.capacity > 0 ? Math.min(100, Math.round((room.checkedIn / room.capacity) * 100)) : 0;
  return (
    <div className="rounded-xl border border-line bg-card px-3 py-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[14px] font-bold text-fg">
          <span className="tabular-nums">{room.checkedIn}</span>
          {room.capacity > 0 && <span className="text-muted"> / {room.capacity}</span>} in the room
        </p>
        <p className="text-[12px] text-muted">
          {approvedIn} of {approved} approved here · {Math.max(0, approved - approvedIn)} still expected
          {session.location ? ` · ${session.location}` : ""}
        </p>
      </div>
      {room.capacity > 0 && (
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-elevated">
          <div className={`h-full ${pct >= 100 ? "bg-rose-500" : pct >= 85 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}

function ResultCard({ card, busy, onLetIn, onClose }: { card: Card; busy: boolean; onLetIn: () => void; onClose: () => void }) {
  const copy = VERDICT_COPY[card.verdict];
  // Good news clears itself so the next person can step up; anything
  // that needs a decision stays until somebody makes it. Keyed on the
  // card alone — the list refreshing underneath must not restart it.
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (card.verdict !== "checked_in" && card.verdict !== "already") return;
    const t = setTimeout(() => close.current(), 3500);
    return () => clearTimeout(t);
  }, [card]);

  return (
    <div role="status" className={`relative rounded-2xl border-2 px-4 py-3 ${TONE[copy.tone]}`}>
      <button type="button" onClick={onClose} aria-label="Dismiss" className="absolute right-2 top-2 rounded p-1 opacity-60 hover:opacity-100">
        <X size={16} />
      </button>
      <p className="text-[12px] font-bold uppercase tracking-wide">{copy.title}</p>
      {card.name && <p className="mt-0.5 text-[22px] font-bold leading-tight">{card.name}</p>}
      {card.email && <p className="text-[12.5px] opacity-80">{card.email}</p>}
      <p className="mt-1 text-[13px]">
        {card.verdict === "checked_in" && card.checkedInAt && `Checked in at ${clock(card.checkedInAt)}.`}
        {card.verdict === "already" && card.checkedInAt && `Came in at ${clock(card.checkedInAt)} — nothing recorded twice.`}
        {card.verdict === "can_let_in" && `${SEAT_LABEL[card.status ?? ""] ?? "No decision"} for this session. The room has space (${card.room.checkedIn}${card.room.capacity ? ` of ${card.room.capacity}` : ""}).`}
        {card.verdict === "full" && `${SEAT_LABEL[card.status ?? ""] ?? "No decision"} for this session, and the room is full (${card.room.checkedIn} of ${card.room.capacity}).`}
        {card.verdict === "declined" && "Their place in this session was declined."}
        {card.verdict === "not_this_session" && (card.otherSessions.length ? "They are registered for:" : "They have no sessions on this registration.")}
        {card.verdict === "unknown" && "This is not a Training Week pass, or its registration has been deleted. Look them up in the List."}
      </p>
      {card.verdict === "not_this_session" && card.otherSessions.length > 0 && (
        <ul className="mt-1 space-y-0.5 text-[13px]">
          {card.otherSessions.map((s, i) => (
            <li key={i}>• <strong>{s.title}</strong> — {s.when} <span className="opacity-75">({SEAT_LABEL[s.status] ?? s.status})</span></li>
          ))}
        </ul>
      )}
      {card.verdict === "can_let_in" && (
        <div className="mt-2 flex gap-2">
          <button type="button" onClick={onLetIn} disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-4 py-2 text-[14px] font-bold text-white hover:bg-amber-700 disabled:opacity-50">
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Let in
          </button>
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-[13px] font-semibold opacity-75 hover:opacity-100">Not now</button>
        </div>
      )}
    </div>
  );
}

/**
 * The camera. BarcodeDetector where the browser has it (Chrome, Android),
 * jsQR on a canvas where it does not (Safari on iPhone). A few frames a
 * second is plenty for a person holding a phone up.
 */
function Scanner({ onToken, paused }: { onToken: (raw: string) => void; paused: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<"starting" | "on" | "blocked" | "none">("starting");
  const [typed, setTyped] = useState("");
  const last = useRef<{ raw: string; at: number }>({ raw: "", at: 0 });
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    const Detector = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => { detect: (s: CanvasImageSource) => Promise<{ rawValue: string }[]> } }).BarcodeDetector;
    const detector = Detector ? new Detector({ formats: ["qr_code"] }) : null;

    const found = (raw: string) => {
      const now = Date.now();
      // The same pass held in front of the camera is one scan, not ten.
      if (raw === last.current.raw && now - last.current.at < 4000) return;
      last.current = { raw, at: now };
      onToken(raw);
    };

    const tick = async () => {
      if (stopped) return;
      const v = video.current;
      if (v && v.readyState >= 2 && !pausedRef.current) {
        try {
          if (detector) {
            const codes = await detector.detect(v);
            if (codes[0]?.rawValue) found(codes[0].rawValue);
          } else if (canvas.current) {
            const w = 480;
            const h = Math.round((v.videoHeight / v.videoWidth) * w) || 360;
            const c = canvas.current;
            c.width = w; c.height = h;
            const ctx = c.getContext("2d", { willReadFrequently: true });
            if (ctx) {
              ctx.drawImage(v, 0, 0, w, h);
              const img = ctx.getImageData(0, 0, w, h);
              const code = jsQR(img.data, w, h, { inversionAttempts: "dontInvert" });
              if (code?.data) found(code.data);
            }
          }
        } catch { /* a bad frame is just a bad frame */ }
      }
      timer = setTimeout(tick, 180);
    };

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) { setState("none"); return; }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
        if (stopped) { stream.getTracks().forEach((t) => t.stop()); return; }
        if (video.current) {
          video.current.srcObject = stream;
          await video.current.play().catch(() => {});
        }
        setState("on");
        void tick();
      } catch {
        setState("blocked");
      }
    })();

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onToken]);

  return (
    <div className="space-y-2">
      <div className="relative overflow-hidden rounded-2xl border border-line bg-black">
        <video ref={video} playsInline muted autoPlay className="aspect-[4/3] w-full object-cover" />
        <canvas ref={canvas} className="hidden" />
        {/* The frame to aim at. */}
        <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-1/2 w-1/2 rounded-2xl border-4 border-white/70" />
        </div>
        {state !== "on" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-4 text-center text-[14px] text-white">
            {state === "starting" && "Starting the camera…"}
            {state === "blocked" && "The camera is blocked. Allow camera access for this site in the browser settings — or switch to the List."}
            {state === "none" && "This device has no camera the browser can use. Switch to the List."}
          </div>
        )}
      </div>
      {/* A pass that will not scan can be typed or pasted: the code is under the QR on the pass page. */}
      <form
        className="flex gap-2"
        onSubmit={(e) => { e.preventDefault(); if (typed.trim()) { onToken(typed.trim()); setTyped(""); } }}
      >
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder="Pass won't scan? Paste its link or code"
          className="min-w-0 flex-1 rounded-lg border border-line bg-elevated px-3 py-2 text-[13px] text-fg"
          autoCapitalize="none"
          spellCheck={false}
        />
        <button type="submit" className="rounded-lg border border-line px-3 py-2 text-[13px] font-semibold text-fg hover:bg-elevated">Check</button>
      </form>
    </div>
  );
}

type Filter = "all" | "todo" | "in" | "waiting";

function RosterList({
  rows, room, busy, onCheckIn, onUndo,
}: {
  rows: Row[] | null;
  room: { checkedIn: number; capacity: number } | null;
  busy: string | null;
  onCheckIn: (r: Row, letIn: boolean) => void;
  onUndo: (r: Row) => void;
}) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("todo");
  const space = !room || room.capacity <= 0 || room.checkedIn < room.capacity;

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (rows ?? []).filter((r) => {
      // Declined seats stay out of the way unless somebody is looked up by name.
      if (r.status === "cancelled" && !needle) return false;
      if (needle && !`${r.name} ${r.email}`.toLowerCase().includes(needle)) return false;
      if (filter === "todo") return !r.checkedInAt;
      if (filter === "in") return Boolean(r.checkedInAt);
      if (filter === "waiting") return r.status === "waitlist" || r.status === "pending";
      return true;
    });
  }, [rows, q, filter]);

  // Enter with one approved person left in the search checks them in:
  // the fast path at a desk with a queue.
  const onlyOne = shown.length === 1 && !shown[0].checkedInAt && shown[0].status === "confirmed" ? shown[0] : null;

  if (rows === null) {
    return <p className="flex items-center gap-2 rounded-xl border border-line bg-card p-4 text-[13px] text-muted"><Loader2 size={14} className="animate-spin" /> Loading the list…</p>;
  }

  return (
    <div className="rounded-xl border border-line bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b border-line p-2.5">
        <label className="relative min-w-[14rem] flex-1">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-subtle" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && onlyOne) { onCheckIn(onlyOne, false); setQ(""); } }}
            placeholder="Type a name or email — Enter checks in a single match"
            className="w-full rounded-lg border border-line bg-elevated py-2 pl-8 pr-3 text-[14px] text-fg"
            autoFocus
          />
        </label>
        <div className="inline-flex overflow-hidden rounded-lg border border-line text-[12px] font-semibold">
          {([["todo", "Not in yet"], ["in", "Checked in"], ["waiting", "Waitlisted"], ["all", "Everyone"]] as const).map(([f, label]) => (
            <button key={f} type="button" onClick={() => setFilter(f)} aria-pressed={filter === f}
              className={`px-2.5 py-1.5 ${filter === f ? "bg-brand-600 text-white" : "text-muted hover:bg-elevated"}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="p-4 text-[13px] text-muted">{q ? "Nobody matches that in this session." : "Nobody here."}</p>
      ) : (
        <ul className="divide-y divide-line">
          {shown.map((r) => (
            <li key={r.bookingId} className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 ${r.checkedInAt ? "bg-emerald-500/[0.04]" : ""}`}>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-semibold text-fg">{r.name}</p>
                <p className="truncate text-[11.5px] text-subtle">{r.email}</p>
              </div>
              <span className={`rounded px-1.5 py-0.5 text-[11px] font-bold ${SEAT_TONE[r.status] ?? SEAT_TONE.pending}`}>{SEAT_LABEL[r.status] ?? r.status}</span>
              {r.checkedInAt ? (
                <span className="inline-flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-emerald-700">
                    <Check size={13} /> {clock(r.checkedInAt)}{r.method === "manual" ? " · list" : ""}
                  </span>
                  <button type="button" onClick={() => onUndo(r)} disabled={busy === r.bookingId}
                    className="inline-flex items-center gap-1 rounded border border-line px-2 py-1 text-[11.5px] font-semibold text-muted hover:text-fg disabled:opacity-50">
                    <Undo2 size={12} /> Undo
                  </button>
                </span>
              ) : r.status === "confirmed" ? (
                <button type="button" onClick={() => onCheckIn(r, false)} disabled={busy === r.bookingId}
                  className="inline-flex min-w-[6.5rem] items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-[13px] font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
                  {busy === r.bookingId ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Check in
                </button>
              ) : r.status === "cancelled" ? (
                <span className="min-w-[6.5rem] text-center text-[12px] text-rose-700">No place</span>
              ) : (
                <button type="button" onClick={() => onCheckIn(r, true)} disabled={!space || busy === r.bookingId}
                  title={space ? "There is space in the room" : "The room is full"}
                  className="inline-flex min-w-[6.5rem] items-center justify-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-[13px] font-bold text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-40">
                  {busy === r.bookingId ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />} {space ? "Let in" : "Full"}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
