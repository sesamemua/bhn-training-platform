"use client";

/**
 * The admin panel, running in its own window.
 *
 * Holds no chart of its own: it asks the editor for one on mount and then
 * renders whatever arrives. That is the point — a second screen showing
 * the consequence of the process while you change the process on the
 * first. It shows what the editor currently HAS, not what was last saved,
 * so an unsaved experiment is visible here too.
 */
import { useEffect, useRef, useState } from "react";
import { Loader2, Unplug } from "lucide-react";
import { FlowAdminPreview } from "./FlowAdminPreview";
import { openFlowChannel, postFlow, readFlow } from "@/lib/flowchart/channel";
import type { ChartDoc, ChartSettings } from "@/lib/flowchart/types";

export function FlowAdminPanelWindow({ canEdit }: { canEdit: boolean }) {
  const [doc, setDoc] = useState<ChartDoc | null>(null);
  const [title, setTitle] = useState("");
  const [live, setLive] = useState(true);
  // A ref, not state: nothing renders differently because the channel
  // exists, and assigning state in an effect body is the thing this
  // codebase keeps getting told off for.
  const channelRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    const ch = openFlowChannel();
    channelRef.current = ch;
    if (!ch) return;

    ch.onmessage = (e) => {
      const msg = readFlow(e);
      if (!msg) return;
      if (msg.type === "doc") {
        setDoc(msg.doc);
        setTitle(msg.title);
        setLive(true);
      } else if (msg.type === "editor-closed") {
        setLive(false);
      }
    };

    // The editor may have been open long before this window; ask rather
    // than wait for its next edit.
    postFlow(ch, { type: "request" });
    return () => { ch.close(); channelRef.current = null; };
  }, []);

  const onSettings = (patch: Partial<ChartSettings>) => {
    // Optimistic locally so the field does not fight the typist, and sent
    // back so the editor — which owns the document — actually records it.
    setDoc((d) => (d ? { ...d, settings: { ...d.settings, ...patch } } : d));
    postFlow(channelRef.current, { type: "settings", patch });
  };

  if (!doc) {
    return (
      <Empty>
        <Loader2 size={14} className="mb-2 inline animate-spin" />
        <br />
        Waiting for the Flow Charts window. If it is closed, open it and this
        panel will catch up on its own.
      </Empty>
    );
  }

  const onEditDoc = (next: ChartDoc) => {
    // Applied here first so the grid does not lag a round-trip behind the
    // typing, then sent to the editor, which owns the document.
    setDoc(next);
    postFlow(channelRef.current, { type: "doc-edit", doc: next });
  };

  return (
    <div className="min-h-screen bg-elevated">
      <div className="mx-auto max-w-2xl px-4 py-4">
        <div className="flex items-baseline justify-between pb-2">
          <p className="truncate text-[12.5px] font-semibold text-fg">{title || "Flow chart"}</p>
          <p className={`text-[11px] ${live ? "text-subtle" : "text-amber-600"}`}>
            {live ? "following the editor" : (
              <span className="inline-flex items-center gap-1">
                <Unplug size={10} /> editor closed — showing the last version
              </span>
            )}
          </p>
        </div>
        <FlowAdminPreview doc={doc} canEdit={canEdit} onSettings={onSettings} onDoc={canEdit ? onEditDoc : undefined} />
      </div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-elevated px-8">
      <p className="max-w-sm text-center text-[13px] leading-relaxed text-muted">{children}</p>
    </div>
  );
}
