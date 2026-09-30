"use client";

/**
 * Storage for the shoot: how much the filming day records, when the
 * camera's drive has to be copied off and for how long, and which drives
 * to buy. The filming windows come from the Filming day tab; the rest is
 * chosen here and not saved — it is a calculator.
 */
import { useState } from "react";
import { HardDrive } from "lucide-react";
import { clockOf } from "@/lib/video/filming";
import {
  AUDIO_MB_S, FORMATS, FPS, HST, MAG_GB, OFFLOAD, STAPLES_CHECKED,
  cheapestSet, offloadPlan, rateMBs, setPrice, type Dest, type Drive,
} from "@/lib/video/storage";

const SELECT = "rounded-md border border-line bg-card-solid px-1.5 py-1 text-[12px] text-fg";
const tb = (gb: number) => `${(gb / 1000).toFixed(2)} TB`;
const hm = (min: number) => `${Math.floor(min / 60)} h${min % 60 ? ` ${Math.round(min % 60)} min` : ""}`;
const at = (min: number) => (min >= 1440 ? `${clockOf(min - 1440)} (next day)` : clockOf(min));
const money = (n: number) => n.toLocaleString("en-CA", { style: "currency", currency: "CAD" });

function DriveSet({ set }: { set: { drive: Drive; n: number }[] | null }) {
  if (!set) return <span className="text-rose-600">Not enough in stock at 375 University — order ahead or try another store.</span>;
  return <>{set.map((x) => `${x.n > 1 ? `${x.n} × ` : ""}${x.drive.name} (${money(x.drive.price)})`).join(" + ")}</>;
}

export function StorageCard({ windows }: { windows: { s: number; e: number; title: string }[] }) {
  const [format, setFormat] = useState<string>("og-hq");
  const [fps, setFps] = useState<number>(23.976);
  const [roll, setRoll] = useState(0.75);
  const [mags, setMags] = useState(2);
  const [dest, setDest] = useState<Dest>("ssd");

  const f = FORMATS.find((x) => x.id === format) ?? FORMATS[0];
  const onCamera = windows.reduce((s, w) => s + (w.e - w.s), 0);
  const plan = offloadPlan({ windows, rate: rateMBs(f, fps), roll, mags, dest });
  const soundGB = (onCamera * 60 * AUDIO_MB_S) / 1000;
  const needTB = ((plan.footageGB + soundGB) / 1000) * 1.1; // 10% headroom
  const ssd1 = cheapestSet(needTB, "ssd");
  const taken = new Map((ssd1 ?? []).map((x) => [x.drive.name, x.n]));
  const ssd2 = cheapestSet(needTB, "ssd", taken);
  const hdd = cheapestSet(needTB, "hdd");
  const safe = ssd1 && ssd2 ? setPrice(ssd1) + setPrice(ssd2) : null;
  const budget = ssd1 && hdd ? setPrice(ssd1) + setPrice(hdd) : null;
  const magsForDay = Math.ceil(plan.footageGB / MAG_GB);

  return (
    <section aria-labelledby="storage-h" className="rounded-xl border border-line bg-card p-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 id="storage-h" className="inline-flex items-center gap-1.5 text-[15px] font-bold text-fg"><HardDrive size={15} /> Storage — footage, sound and drives</h2>
        <div className="ml-auto flex flex-wrap items-center gap-1.5 text-[11.5px] text-muted">
          <select id="storage-format" aria-label="Recording format" value={format} onChange={(e) => setFormat(e.target.value)} className={SELECT}>
            {FORMATS.map((x) => <option key={x.id} value={x.id}>{x.mode} · {x.codec}{x.id === "og-hq" ? " (recommended)" : ""}</option>)}
          </select>
          <select id="storage-fps" aria-label="Frame rate" value={fps} onChange={(e) => setFps(Number(e.target.value))} className={SELECT}>
            {FPS.map((x) => <option key={x} value={x}>{x} fps</option>)}
          </select>
          <select id="storage-roll" aria-label="How much of the filming time the camera rolls" value={roll} onChange={(e) => setRoll(Number(e.target.value))} className={SELECT}>
            {[0.5, 0.6, 0.75, 0.9, 1].map((x) => <option key={x} value={x}>Rolling {Math.round(x * 100)}%</option>)}
          </select>
          <select id="storage-mags" aria-label="1 TB Compact Drives from the rental" value={mags} onChange={(e) => setMags(Number(e.target.value))} className={SELECT}>
            {[1, 2, 3].map((x) => <option key={x} value={x}>{x} × 1 TB mag{x > 1 ? "s" : ""}</option>)}
          </select>
          <select id="storage-dest" aria-label="Copy the footage to" value={dest} onChange={(e) => setDest(e.target.value as Dest)} className={SELECT}>
            {(Object.keys(OFFLOAD) as Dest[]).map((k) => <option key={k} value={k}>To: {OFFLOAD[k].label}</option>)}
          </select>
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {[
          ["On camera", `${hm(onCamera)} scheduled`, `${hm(onCamera * roll)} rolling`],
          ["Footage", tb(plan.footageGB), `${rateMBs(f, fps).toFixed(0)} MB/s · ${f.depth}`],
          ["Sound", `${soundGB.toFixed(1)} GB`, "3 tracks · 48 kHz 24-bit WAV"],
          ["1 TB mags", `${(plan.footageGB / MAG_GB).toFixed(1)} fills`, `${magsForDay} mags would hold the day unerased`],
          ["Your 1 TB drive", needTB <= 1 ? "Enough" : "Not enough", `needs ${needTB.toFixed(1)} TB per copy (+10%)`],
        ].map(([k, v, sub]) => (
          <div key={k} className="rounded-lg bg-elevated/50 px-2.5 py-2">
            <dt className="text-[10.5px] font-semibold uppercase tracking-wide text-subtle">{k}</dt>
            <dd className={`text-[15px] font-bold tabular-nums ${k === "Your 1 TB drive" && needTB > 1 ? "text-rose-600" : "text-fg"}`}>{v}</dd>
            <dd className="text-[11px] leading-snug text-muted">{sub}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <div>
          <h3 className="text-[12.5px] font-bold text-fg">When to dump footage</h3>
          <p className="text-[11.5px] text-muted">
            From the Filming day. Filming: {windows.map((w) => `${clockOf(w.s)}–${clockOf(w.e)}`).join(", ") || "nothing on camera yet"}.
          </p>
          <ol className="mt-1.5 space-y-1">
            {plan.events.map((e, i) => (
              <li key={i} className="flex gap-2 text-[12px]">
                <span className="w-24 shrink-0 font-semibold tabular-nums text-fg">{at(e.at)}</span>
                <span className={e.kind === "stop" ? "font-semibold text-rose-600" : "text-fg"}>{e.text}</span>
              </li>
            ))}
          </ol>
          <p className={`mt-1.5 text-[12px] font-semibold ${plan.waitMin ? "text-rose-600" : "text-emerald-600"}`}>
            {plan.waitMin ? `The camera waits ${hm(plan.waitMin)} for copies — everything after slips by that much.` : "The camera never waits for a copy."}{" "}
            <span className="font-normal text-muted">Last copy done about {at(plan.doneAt)}.</span>
          </p>
          <p className="mt-1 text-[11.5px] text-muted">
            Ruilin is behind the camera, so someone else starts each copy — it is a drag and a click in the offload app. Never erase a mag until its footage is on two drives and checked.
          </p>
        </div>

        <div>
          <h3 className="text-[12.5px] font-bold text-fg">What to buy</h3>
          <ul className="mt-1 space-y-1.5 text-[12px] text-fg">
            <li>
              <strong>Safe:</strong> two SSD copies at once — <DriveSet set={ssd1} /> and <DriveSet set={ssd2} />.
              {safe != null && <span className="text-muted"> {money(safe)}, {money(safe * (1 + HST))} with HST.</span>}
            </li>
            <li>
              <strong>Budget:</strong> SSD on the day, hard drive as the backup that evening — <DriveSet set={ssd1} /> + <DriveSet set={hdd} />.
              {budget != null && <span className="text-muted"> {money(budget)}, {money(budget * (1 + HST))} with HST.</span>}
              <span className="text-muted"> Rent {magsForDay} mags so none is erased before the backup is done.</span>
            </li>
            <li className="text-muted">Your own 1 TB: the sound, a second copy of the sound, and the project files.</li>
          </ul>
          <p className="mt-1.5 text-[11.5px] text-muted">
            <strong className="text-fg">SSD or spinning?</strong> SSD on set: a full mag copies and checks in about {Math.ceil((MAG_GB * 1000) / OFFLOAD.ssd.mbs / 60)} min; a portable hard drive takes about {hm(Math.ceil((MAG_GB * 1000) / OFFLOAD.hdd.mbs / 60))}, which stops the camera. Hard drives are fine for the overnight backup.
          </p>
          <p className="mt-1 text-[11px] text-subtle">
            Staples, 375 University Ave (5 min from FitzGerald), checked {STAPLES_CHECKED}; stock is one or two of each, so buy on the prep day, not the morning of.
          </p>
        </div>
      </div>

      <details className="mt-3 rounded-lg border border-line px-2.5 py-1.5 text-[12px] text-fg">
        <summary className="cursor-pointer font-semibold">Recommended settings — ALEXA Mini LF, open gate, anamorphic</summary>
        <ul className="mt-1.5 list-disc space-y-1 pl-4 text-muted">
          <li><strong className="text-fg">LF Open Gate 4.5K (4448 × 3096), ProRes 422 HQ, 23.976 fps, LogC3.</strong> The Mini LF has no 4K open gate — open gate is 4.5K, which leaves room for a 4K finish.</li>
          <li><strong className="text-fg">Why HQ:</strong> sit-down interviews, no green screen — 10-bit Log grades cleanly. ProRes 4444 is 1.5× the data, 4444 XQ 2.3×, ARRIRAW 3.4×, for no difference anyone will see in a promo.</li>
          <li><strong className="text-fg">Anamorphic:</strong> use full-frame 1.5× or 1.8× lenses that cover LF open gate (1.5× gives 2.16:1, cropped to 2.39:1). 2× Super 35 anamorphics will vignette on open gate. Set the de-squeeze in the camera to match, for the monitor.</li>
          <li><strong className="text-fg">Mags:</strong> ask the rental house for a second 1 TB Compact Drive and the Codex Compact Drive reader (USB-C). With one mag the camera stops while it is copied.</li>
          <li><strong className="text-fg">Sound:</strong> 48 kHz / 24-bit WAV, 3 tracks — about 1.6 GB an hour, nothing next to the picture.</li>
        </ul>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-left text-[11.5px] tabular-nums">
            <thead className="text-subtle"><tr><th className="py-1 pr-3 font-semibold">Format</th><th className="pr-3 font-semibold">MB/s</th><th className="pr-3 font-semibold">1 TB mag holds</th><th className="font-semibold">This day</th></tr></thead>
            <tbody>
              {FORMATS.map((x) => {
                const r = rateMBs(x, fps);
                return (
                  <tr key={x.id} className={`border-t border-line ${x.id === format ? "font-semibold text-fg" : "text-muted"}`}>
                    <td className="py-1 pr-3">{x.mode} · {x.codec}</td>
                    <td className="pr-3">{r.toFixed(0)}</td>
                    <td className="pr-3">{hm(Math.floor((MAG_GB * 1000) / r / 60))}</td>
                    <td>{tb(r * onCamera * roll * 60 / 1000)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-1 text-[11px] text-subtle">Data rates from ARRI&apos;s Mini LF record-times table (25 fps), scaled to the frame rate. Copy speeds are estimates including the checksum read-back.</p>
      </details>
    </section>
  );
}
