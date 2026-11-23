"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ChangePassage } from "@/lib/symposium-report/change-passages";
import styles from "./report.module.css";

export function ReportChangePopup({ frameId, pageNumber, passages, track, onTrack, onClose }: {
  frameId: string; pageNumber: number; passages: ChangePassage[]; track: boolean; onTrack?: (value: boolean) => void; onClose: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null), close = useRef<HTMLButtonElement>(null), handleClose = useRef(onClose);
  useEffect(() => { handleClose.current = onClose; }, [onClose]);
  const [selected, setSelected] = useState(0);
  const [geometry, setGeometry] = useState<{ x: number; y: number; width: number; height: number; path: string } | null>(null);
  const item = passages[Math.min(selected, passages.length - 1)];
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    close.current?.focus({ preventScroll: true });
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); handleClose.current(); } };
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("keydown", key); if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, []);
  useLayoutEffect(() => {
    if (!item) return;
    const frame = document.getElementById(frameId);
    const candidates = [...(frame?.querySelectorAll<HTMLElement>("[data-report-field]") ?? [])].filter(e => e.dataset.reportField === item.key);
    const targets = candidates.filter(e => item.start === undefined || Number(e.dataset.reportTextEnd) > item.start && Number(e.dataset.reportTextStart) <= Math.max(item.start, item.end! - 1));
    const target = targets[0] ?? candidates.at(-1) ?? frame?.querySelector<HTMLElement>("header");
    target?.scrollIntoView({ block: "center", behavior: "instant" });
    let raf = 0;
    const update = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (!target || !panel.current) return;
        const r = target.getBoundingClientRect(), p = panel.current.getBoundingClientRect();
        const x = Math.max(4, r.left - 5), y = Math.max(4, r.top - 5);
        const endX = Math.min(innerWidth - 8, r.right + 5), endY = Math.min(innerHeight - 8, r.bottom + 5);
        setGeometry({ x, y, width: Math.max(0, endX - x), height: Math.max(0, endY - y), path: `M ${p.left + 24} ${p.top} L ${p.left + 24} ${y + 12} L ${x} ${y + 12}` });
      });
    };
    update(); window.addEventListener("scroll", update, true); window.addEventListener("resize", update);
    const observer = new ResizeObserver(update); if (frame) observer.observe(frame); if (panel.current) observer.observe(panel.current);
    return () => { cancelAnimationFrame(raf); observer.disconnect(); window.removeEventListener("scroll", update, true); window.removeEventListener("resize", update); };
  }, [frameId, item, track]);
  if (!item) return null;
  const view = (before: boolean) => track ? item.marks.filter(p => before ? p.kind !== "ins" : p.kind !== "del").map((p, i) => p.kind === "ins" ? <ins key={i} className={styles.ins}>{p.text}</ins> : p.kind === "del" ? <del key={i} className={styles.del}>{p.text}</del> : p.text) : before ? item.before : item.after;
  return createPortal(<>
    {geometry && <svg className={styles.changeConnector} aria-label="Changed paragraph highlight" width="100%" height="100%"><path d={geometry.path} fill="none" /><rect x={geometry.x} y={geometry.y} width={geometry.width} height={geometry.height} rx="4" /></svg>}
    <div id={`${frameId}-changes`} ref={panel} className={styles.changePopup} role="dialog" aria-modal="false" aria-label={`Text changes for page ${pageNumber}`}>
      <header><div><strong>Text changes · Page {pageNumber}</strong><p>Before and after · connected to the highlighted passage</p></div><button ref={close} type="button" onClick={onClose} aria-label="Close text changes">×</button></header>
      <div className={styles.changePopupControls}><label>Changed passage <select value={Math.min(selected, passages.length - 1)} onChange={e => setSelected(Number(e.target.value))}>{passages.map((p, i) => <option key={`${p.key}:${p.start}:${i}`} value={i}>{p.label}</option>)}</select></label><label><input type="checkbox" checked={track} onChange={e => onTrack?.(e.target.checked)} disabled={!onTrack} /> Track changes on report</label></div>
      {item.author && <p className={styles.changeAuthor}>Last field edit: {item.author}{item.at ? ` · ${new Date(item.at).toLocaleString("en-CA")}` : ""}</p>}
      <div className={styles.changeComparison}><section aria-label="Before"><h3>Before</h3><p>{view(true) || <em>No previous text</em>}</p></section><section aria-label="After"><h3>After</h3><p>{view(false) || <em>Text removed</em>}</p></section></div>
    </div>
  </>, document.body);
}
