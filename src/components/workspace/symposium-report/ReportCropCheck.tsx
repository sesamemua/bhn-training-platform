"use client";

import { useEffect, useRef, useState } from "react";
import { ScanFace } from "lucide-react";
import type { Report } from "@/lib/symposium-report/document";
import { pagePhoto } from "@/lib/symposium-report/photos";
import { detectHeads } from "@/lib/images/detect-heads";
import { headCropRisk, primaryHead } from "@/lib/images/head-crop";
import type { Frame } from "./ReportPaper";
import styles from "./report.module.css";

type Result = { key: string; label: string; frame: Frame; slot?: string; state: "clipped" | "fits" | "manual" };

export function ReportCropCheck({ report, disabled, onPhoto }: { report: Report; disabled: boolean; onPhoto?: (frame: Frame, slot?: string) => void }) {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [stale, setStale] = useState(false);
  const run = useRef(0);
  const lastReport = useRef(report);
  useEffect(() => {
    if (lastReport.current !== report) { lastReport.current = report; run.current++; setRunning(false); setStale(true); }
  }, [report]);
  useEffect(() => () => { run.current++; }, []);
  async function check() {
    const generation = ++run.current;
    setRunning(true); setStale(false); setResults([]);
    const figures = Array.from(document.querySelectorAll<HTMLElement>('[data-report-paper] article figure[data-report-photo]'));
    const found: Result[] = [];
    for (let i = 0; i < figures.length; i++) {
      if (run.current !== generation) return;
      const figure = figures[i], article = figure.closest<HTMLElement>('article[data-section]');
      const section = article?.dataset.section, index = Number(article?.dataset.frameIndex ?? 0);
      const page = report.pages.find(p => p.id === section), image = figure.querySelector('img'), mat = figure.querySelector<HTMLElement>('[data-fit]');
      if (!page || !image || !mat) continue;
      const slot = figure.dataset.photoSlot || undefined;
      const photo = page.photos?.[slot ?? String(index)] ?? pagePhoto(page, index, {});
      if (photo.file.startsWith("program-") || photo.file === "team-placeholder.webp") continue;
      const label = `Page ${article?.getAttribute('aria-label')?.match(/^Page (\d+)/)?.[1] ?? "?"} · ${image.alt}`;
      const result: Result = { key: `${page.id}:${index}:${slot ?? "main"}`, label, frame: { id: page.id, index }, slot, state: "manual" };
      setProgress(`Checking photo ${i + 1} of ${figures.length}…`);
      try {
        if (image.complete && image.naturalWidth) {
          const head = photo.subject ?? primaryHead(await detectHeads(image));
          if (head) result.state = headCropRisk(head, { width: image.naturalWidth, height: image.naturalHeight }, { width: mat.clientWidth, height: mat.clientHeight }, photo).clipped ? "clipped" : "fits";
        }
      } catch { /* A failed detector never becomes a passing crop check. */ }
      if (run.current !== generation) return;
      found.push(result); setResults([...found]);
      await new Promise(resolve => window.setTimeout(resolve, 0));
    }
    setProgress("Photo check complete. Suggested subjects need visual confirmation; the cover needs a manual check."); setRunning(false);
  }
  const issues = results.filter(r => r.state !== "fits");
  return <section className={styles.cropAudit} aria-label="Primary subject crop check">
    <button type="button" disabled={disabled || running} onClick={() => void check()}><ScanFace size={15} aria-hidden="true" />Check photo crops</button>
    {running && <button type="button" onClick={() => { run.current++; setRunning(false); setProgress("Photo check stopped. Run again to check all photos."); }}>Stop check</button>}
    {stale ? <p role="status">Photos changed. Run the crop check again.</p> : progress && <p role="status">{progress}</p>}
    {results.length > 0 && !stale && <>
      <p>{results.filter(r => r.state === "clipped").length} cropped heads · {results.filter(r => r.state === "manual").length} need a manual check</p>
      <details><summary>Inspect {issues.length} flagged photos</summary><ul>{issues.map(result => <li key={result.key}><span>{result.label}</span><strong>{result.state === "clipped" ? "Main head cropped" : "Confirm main subject"}</strong>{onPhoto && <button type="button" disabled={disabled || running} onClick={() => onPhoto(result.frame, result.slot)}>Adjust photo</button>}</li>)}</ul></details>
    </>}
  </section>;
}
