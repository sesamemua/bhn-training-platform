/**
 * How much footage a filming day makes, and when the camera's drive has to
 * be copied off. For the ALEXA Mini LF recording to 1 TB Codex Compact
 * Drives ("mags"), with sound on a separate recorder.
 *
 * Data rates are ARRI's at 25 fps (the Mini LF record-times table) and are
 * scaled to the frame rate. Offload speeds are estimates for a Codex
 * Compact Drive Reader over USB-C, including the read-back check.
 *
 * Pure module: no React, no Prisma.
 */

export const FORMATS = [
  { id: "og-hq", mode: "LF Open Gate 4.5K", res: "4448 × 3096", codec: "ProRes 422 HQ", depth: "10-bit 4:2:2", mbps25: 1226 },
  { id: "og-4444", mode: "LF Open Gate 4.5K", res: "4448 × 3096", codec: "ProRes 4444", depth: "12-bit 4:4:4", mbps25: 1839 },
  { id: "og-xq", mode: "LF Open Gate 4.5K", res: "4448 × 3096", codec: "ProRes 4444 XQ", depth: "12-bit 4:4:4", mbps25: 2795 },
  { id: "og-raw", mode: "LF Open Gate 4.5K", res: "4448 × 3096", codec: "ARRIRAW", depth: "12-bit raw", mbps25: 4137 },
  { id: "uhd-hq", mode: "LF 16:9 UHD 4K", res: "3840 × 2160", codec: "ProRes 422 HQ", depth: "10-bit 4:2:2", mbps25: 735 },
  { id: "uhd-4444", mode: "LF 16:9 UHD 4K", res: "3840 × 2160", codec: "ProRes 4444", depth: "12-bit 4:4:4", mbps25: 1102 },
] as const;
export type Format = (typeof FORMATS)[number];
export const FPS = [23.976, 24, 25] as const;

/** What a 1 TB Compact Drive holds in practice (ARRI's record times imply ~960 GB). */
export const MAG_GB = 960;
/** Three tracks, 48 kHz, 24-bit WAV: 3 × 48 000 × 3 bytes a second. */
export const AUDIO_MB_S = 0.432;

/** Copy + checksum read-back, MB/s. Both at once runs at the slower drive's pace. */
export const OFFLOAD = {
  ssd: { label: "Portable SSD", mbs: 350 },
  hdd: { label: "Spinning hard drive", mbs: 65 },
  both: { label: "SSD + hard drive at once", mbs: 65 },
} as const;
export type Dest = keyof typeof OFFLOAD;

/** MB a second for a format at a frame rate. */
export const rateMBs = (f: Pick<Format, "mbps25">, fps: number) => (f.mbps25 * fps) / 25 / 8;
/** Minutes to copy and check `gb` at `mbs`. */
export const offloadMinutes = (gb: number, mbs: number) => Math.ceil((gb * 1000) / mbs / 60);

/** Filming windows (minutes after midnight), overlaps merged. */
export function mergeWindows(ws: { s: number; e: number }[]) {
  const out: { s: number; e: number }[] = [];
  for (const w of [...ws].filter((w) => w.e > w.s).sort((a, b) => a.s - b.s)) {
    const last = out[out.length - 1];
    if (last && w.s <= last.e) last.e = Math.max(last.e, w.e);
    else out.push({ ...w });
  }
  return out;
}

export interface PlanEvent { at: number; text: string; kind: "swap" | "offload" | "stop" | "wrap" }
export interface Plan {
  footageGB: number;
  events: PlanEvent[];
  /** Minutes the camera stood waiting for a drive; everything after slips by this much. */
  waitMin: number;
  /** When the last copy finishes, minutes after midnight. */
  doneAt: number;
}

/**
 * Walks the day a minute at a time. The camera records during the windows
 * (at `roll` of the time — cameras cut between takes); one reader copies
 * one mag at a time. A mag is copied off in a gap when the copy fits
 * before filming starts again; with a second mag the camera swaps and the
 * full one is copied while filming carries on. With no mag ready the
 * camera waits, and the rest of the day slips.
 */
export function offloadPlan({ windows, rate, roll, mags, dest }: {
  windows: { s: number; e: number }[]; rate: number; roll: number; mags: number; dest: Dest;
}): Plan {
  const ws = mergeWindows(windows);
  const perMin = (rate * roll * 60) / 1000; // GB a minute of filming
  const mbs = OFFLOAD[dest].mbs;
  const m = Array.from({ length: Math.max(1, mags) }, () => ({ fill: 0, freeAt: -1 }));
  const events: PlanEvent[] = [];
  const name = (i: number) => (m.length > 1 ? `Mag ${"ABCDEF"[i]}` : "The mag");
  let active = 0, readerFree = 0, slip = 0, waitMin = 0, footage = 0;
  const offload = (i: number, t: number, kind: PlanEvent["kind"], why: string) => {
    const mins = offloadMinutes(m[i].fill, mbs);
    const start = Math.max(t, readerFree);
    m[i].freeAt = readerFree = start + mins;
    events.push({ at: start, kind, text: `${why}: copy ${name(i)} off — ${Math.round(m[i].fill)} GB, about ${mins} min` });
  };
  if (!ws.length) return { footageGB: 0, events, waitMin: 0, doneAt: 0 };
  const end = ws[ws.length - 1].e;
  for (let t = ws[0].s; t - slip < end; t++) {
    for (const x of m) if (x.freeAt >= 0 && t >= x.freeAt) { x.fill = 0; x.freeAt = -1; }
    const filming = ws.some((w) => t - slip >= w.s && t - slip < w.e);
    const ready = (i: number) => m[i].freeAt < 0 && m[i].fill + perMin <= MAG_GB;
    if (filming) {
      if (!ready(active)) {
        const other = m.findIndex((_, i) => i !== active && ready(i));
        if (other >= 0) {
          if (m[active].freeAt < 0) offload(active, t, "swap", `${name(active)} full — swap to ${name(other)}`);
          active = other;
        } else {
          if (m[active].freeAt < 0) offload(active, t, "stop", `${name(active)} full, camera stops`);
          slip++; waitMin++;
          continue;
        }
      }
      m[active].fill += perMin; footage += perMin;
      continue;
    }
    if (t < readerFree) continue;
    // A gap: copy off whatever is full enough to matter, if the camera will not need it first.
    const next = ws.find((w) => w.s > t - slip);
    const gap = next ? next.s - (t - slip) : Infinity;
    const idle = m.findIndex((x, i) => i !== active && x.fill > 0 && x.freeAt < 0);
    if (idle >= 0) { offload(idle, t, "offload", "Between takes"); continue; }
    if (m[active].fill > 0 && m[active].freeAt < 0) {
      const empty = m.findIndex((x, i) => i !== active && x.fill === 0 && x.freeAt < 0);
      if (empty >= 0) { offload(active, t, "offload", `In the gap, swap to ${name(empty)}`); active = empty; }
      else if (offloadMinutes(m[active].fill, mbs) <= gap) offload(active, t, "offload", "In the gap");
    }
  }
  // After the wrap: everything still on a mag.
  let t = end + slip;
  for (let i = 0; i < m.length; i++) if (m[i].fill > 0 && m[i].freeAt < 0) offload(i, t, "wrap", "After the wrap");
  t = Math.max(t, readerFree);
  return { footageGB: footage, events: events.sort((a, b) => a.at - b.at), waitMin, doneAt: t };
}

/** Staples, 375 University Ave (closest to FitzGerald) — prices and stock checked 30 Sep 2026, before HST. */
export const STAPLES_CHECKED = "30 Sep 2026";
export const HST = 0.13;
export const DRIVES = [
  { name: "Samsung T7 1 TB SSD", kind: "ssd", tb: 1, price: 374.99, stock: 1 },
  { name: "Samsung T7 Shield 2 TB SSD", kind: "ssd", tb: 2, price: 779.99, stock: 3 },
  { name: "Samsung T7 4 TB SSD", kind: "ssd", tb: 4, price: 1489.99, stock: 1 },
  { name: "LaCie Rugged 5 TB hard drive (USB-C)", kind: "hdd", tb: 5, price: 371.99, stock: 1 },
] as const;
export type Drive = (typeof DRIVES)[number];

/** The cheapest set of drives of one kind holding `tb`, within what the store has. */
export function cheapestSet(tb: number, kind: Drive["kind"], taken: Map<string, number> = new Map()): { drive: Drive; n: number }[] | null {
  const opts = DRIVES.filter((d) => d.kind === kind);
  let best: { set: { drive: Drive; n: number }[]; price: number } | null = null;
  const walk = (i: number, set: { drive: Drive; n: number }[], cap: number, price: number) => {
    if (cap >= tb) { if (!best || price < best.price) best = { set, price }; return; }
    if (i >= opts.length) return;
    const d = opts[i];
    const left = d.stock - (taken.get(d.name) ?? 0);
    for (let n = 0; n <= Math.min(left, 4); n++) walk(i + 1, n ? [...set, { drive: d, n }] : set, cap + n * d.tb, price + n * d.price);
  };
  walk(0, [], 0, 0);
  return best ? (best as { set: { drive: Drive; n: number }[] }).set : null;
}
export const setPrice = (set: { drive: Drive; n: number }[]) => set.reduce((s, x) => s + x.n * x.drive.price, 0);
