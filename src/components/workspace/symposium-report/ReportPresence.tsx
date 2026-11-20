"use client";

/**
 * Who else has the Event Report open, and where: avatars in the toolbar
 * ("Yoo Jin · editing Story text, p. 12"), a coloured outline with a name tag
 * on the text box a colleague is typing in, and a "viewing" tag on the page
 * they are looking at. Heartbeat every 3 s, like the script editor's presence.
 */
import { useEffect, useRef, useState } from "react";
import styles from "./report.module.css";

export type ReportPeer = { userId: string; name: string; color: string; frame: string | null; field: string | null; fieldIndex: number | null };

const SHEET = '[id^="report-frame-"]';
const EDITABLE = '[contenteditable]:not([contenteditable="false"])';
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]!.toUpperCase()).join("") || "?";

/** Where I am: the page in the middle of the screen, and the text box I'm typing in, if any. */
export function myPresence() {
  const focused = document.activeElement instanceof HTMLElement && document.activeElement.isContentEditable ? document.activeElement : null;
  const editing = focused?.closest<HTMLElement>(SHEET);
  const sheets = Array.from(document.querySelectorAll<HTMLElement>(SHEET));
  const middle = window.innerHeight / 2;
  const viewing = editing ?? sheets.find((sheet) => { const r = sheet.getBoundingClientRect(); return r.top <= middle && r.bottom >= middle; })
    ?? sheets.find((sheet) => sheet.getBoundingClientRect().bottom > 0) ?? null;
  return {
    frame: viewing?.id.replace("report-frame-", "") ?? null,
    field: editing && focused ? (focused.getAttribute("aria-label") ?? "text").slice(0, 80) : null,
    fieldIndex: editing && focused ? Array.from(editing.querySelectorAll(EDITABLE)).indexOf(focused) : null,
  };
}

/** Outline the boxes colleagues are typing in and tag the pages they are viewing; touches only what changed. */
export function paintPeers(peers: ReportPeer[]) {
  const edit = new Map<HTMLElement, { label: string; color: string }>();
  const view = new Map<HTMLElement, string[]>();
  for (const peer of peers) {
    const sheet = peer.frame ? document.getElementById(`report-frame-${peer.frame}`) : null;
    if (!sheet) continue;
    const box = peer.field && peer.fieldIndex !== null ? sheet.querySelectorAll<HTMLElement>(EDITABLE)[peer.fieldIndex] : undefined;
    if (box && !edit.has(box)) { edit.set(box, { label: `${peer.name} is editing`, color: peer.color }); continue; }
    const paper = sheet.querySelector<HTMLElement>("article");
    if (paper) view.set(paper, [...view.get(paper) ?? [], peer.name]);
  }
  document.querySelectorAll<HTMLElement>("[data-peer-edit]").forEach((el) => {
    if (!edit.has(el)) { el.removeAttribute("data-peer-edit"); el.style.removeProperty("--peer-color"); }
  });
  document.querySelectorAll<HTMLElement>("[data-peer-view]").forEach((el) => { if (!view.has(el)) el.removeAttribute("data-peer-view"); });
  for (const [el, { label, color }] of edit) {
    if (el.getAttribute("data-peer-edit") !== label) el.setAttribute("data-peer-edit", label);
    if (el.style.getPropertyValue("--peer-color") !== color) el.style.setProperty("--peer-color", color);
  }
  for (const [el, names] of view) {
    const label = `${names.join(", ")} viewing`;
    if (el.getAttribute("data-peer-view") !== label) el.setAttribute("data-peer-view", label);
  }
}

export function ReportPresence({ endpoint, pageName, onJump }: {
  endpoint: string;
  /** "Structured Networking, p. 12" for a frame id. */
  pageName: (frame: string) => string;
  onJump: (frame: string) => void;
}) {
  const [peers, setPeers] = useState<ReportPeer[]>([]);
  const last = useRef("");
  useEffect(() => {
    let live = true;
    async function beat() {
      try {
        const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(myPresence()) });
        const body = await response.json().catch(() => null) as { peers?: ReportPeer[] } | null;
        if (!live || !response.ok || !Array.isArray(body?.peers)) return;
        const key = JSON.stringify(body.peers);
        if (key !== last.current) { last.current = key; setPeers(body.peers); }
      } catch { /* presence is best-effort */ }
    }
    void beat();
    // setInterval, not requestAnimationFrame: it keeps beating in background tabs.
    const timer = window.setInterval(beat, 3000);
    return () => { live = false; window.clearInterval(timer); paintPeers([]); };
  }, [endpoint]);
  // Repaint after each heartbeat and whenever the pages re-render underneath.
  useEffect(() => {
    paintPeers(peers);
    const timer = window.setInterval(() => paintPeers(peers), 1000);
    return () => window.clearInterval(timer);
  }, [peers]);

  // A plain group, not a live region: it updates every few seconds and must not chatter in a screen reader.
  if (!peers.length) return <p className={styles.presence}>Only you have the report open.</p>;
  return <div className={styles.presence} role="group" aria-label="Who else has the report open">
    <span className={styles.presenceAvatars} aria-hidden="true">
      {peers.slice(0, 6).map((peer) => <i key={peer.userId} style={{ background: peer.color }}>{initials(peer.name)}</i>)}
    </span>
    <ul>
      {peers.map((peer) => <li key={peer.userId}>
        <button type="button" disabled={!peer.frame} onClick={() => peer.frame && onJump(peer.frame)}
          title={peer.frame ? `Go to ${pageName(peer.frame)}` : undefined}>
          <b style={{ color: peer.color }}>{peer.name}</b>{" "}
          {peer.field ? `editing ${peer.field.toLowerCase()}` : "viewing"}{peer.frame ? ` · ${pageName(peer.frame)}` : ""}
        </button>
      </li>)}
    </ul>
  </div>;
}
