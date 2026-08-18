/**
 * The link between the editor and a popped-out admin panel.
 *
 * Two browser windows on the same origin, so BroadcastChannel rather than
 * a server round-trip: the panel is a view of the chart being edited, not
 * of the chart last saved, and going through the database would mean the
 * window only caught up when someone pressed Save.
 *
 * The protocol is deliberately three messages. The panel cannot know when
 * it was opened relative to the editor, so it asks on mount; the editor
 * answers, and thereafter pushes. Anything the panel can edit travels
 * back as a settings patch, because a window that shows live data and
 * silently drops your typing is worse than one that is read-only.
 */
import type { ChartDoc, ChartSettings } from "./types";

export const FLOW_CHANNEL = "bhn-flowchart";

export type FlowMessage =
  /** Panel → editor: "I just opened, send me what you have." */
  | { type: "request" }
  /** Editor → panel: the current document. */
  | { type: "doc"; doc: ChartDoc; title: string }
  /** Panel → editor: change a chart-level setting. */
  | { type: "settings"; patch: Partial<ChartSettings> }
  /**
   * Panel → editor: the whole document, after an edit made in the sheet.
   * The panel holds the document already, so it computes the result with
   * the same functions the editor would and sends the answer, rather than
   * the two windows growing separate half-implementations of each edit.
   */
  | { type: "doc-edit"; doc: ChartDoc }
  /** Editor → panel: the editor is going away. */
  | { type: "editor-closed" };

/**
 * Open the channel, or return null where BroadcastChannel is missing.
 * Callers treat null as "no other window can be talked to", which is the
 * correct behaviour rather than an error — the page still works alone.
 */
export function openFlowChannel(): BroadcastChannel | null {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return null;
  try {
    return new BroadcastChannel(FLOW_CHANNEL);
  } catch {
    return null;
  }
}

export function postFlow(ch: BroadcastChannel | null, msg: FlowMessage) {
  try {
    ch?.postMessage(msg);
  } catch { /* a closed channel is not worth throwing over */ }
}

/** Narrow an incoming `MessageEvent` to a message we understand. */
export function readFlow(e: MessageEvent): FlowMessage | null {
  const d = e.data as FlowMessage | undefined;
  if (!d || typeof d !== "object" || typeof d.type !== "string") return null;
  switch (d.type) {
    case "request":
    case "editor-closed":
      return d;
    case "doc":
    case "doc-edit":
      return d.doc && typeof d.doc === "object" ? d : null;
    case "settings":
      return d.patch && typeof d.patch === "object" ? d : null;
    default:
      return null;
  }
}
