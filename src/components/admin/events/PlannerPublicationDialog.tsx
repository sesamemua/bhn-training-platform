"use client";

import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Check, CloudUpload, Loader2, X } from "lucide-react";
import { WEBSITE_SESSIONS, type PlannerPublicationChanges, type PublicationState } from "@/lib/events/people-publication";
import { PublicProfilePreview } from "./PeoplePublicationPanel";

const API = "/api/admin/symposium-people/publication";
const BUTTON = "inline-flex items-center justify-center gap-2 rounded-md border border-line px-3 py-2 text-sm font-semibold text-fg hover:bg-elevated disabled:opacity-40";
type Preview = { version: string | null; rosterHash: string; initialized: boolean; changes: PlannerPublicationChanges; before: PublicationState["approved"] };

export default function PlannerPublicationDialog({ onClose }: { onClose: () => void }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState("");
  const [consent, setConsent] = useState(false);
  const [result, setResult] = useState<PublicationState | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    async function prepare() {
      try {
        const response = await fetch(API, { cache: "no-store", signal: controller.signal });
        const current = await response.json();
        if (!response.ok) throw new Error(current.error ?? "Couldn't load website publishing.");
        const prepared = await fetch(API, { method: "POST", signal: controller.signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version: current.version, change: { action: "preview-plan" } }) });
        const body = await prepared.json();
        if (!prepared.ok) throw new Error(body.error ?? "Couldn't prepare the preview.");
        if (!controller.signal.aborted) setPreview(body);
      } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Couldn't prepare the preview."); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void prepare();
    return () => controller.abort();
  }, []);

  async function publish() {
    if (!preview || !consent || lock.current || result) return;
    lock.current = true; setBusy(true); setError("");
    try {
      const response = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        version: preview.version, change: { action: "publish-plan", confirm: true, rosterHash: preview.rosterHash, changes: preview.changes },
      }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Couldn't push the changes.");
      setResult(body.state);
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn't push the changes."); setConsent(false); }
    finally { lock.current = false; setBusy(false); }
  }

  return <Dialog.Root open onOpenChange={(open) => { if (!open && !lock.current) onClose(); }}><Dialog.Portal>
    <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
    <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[calc(100%_-_2rem)] max-w-3xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border border-line bg-card-solid text-fg [overflow-wrap:anywhere]">
      <div className="flex items-start justify-between gap-3 border-b border-line p-5">
        <div><Dialog.Title className="text-lg font-bold">Push planner changes to website</Dialog.Title>
          <Dialog.Description className="mt-2 text-sm text-muted">Structured Networking and Interactive Discussion. Keynote and panel placements stay unchanged.</Dialog.Description></div>
        <Dialog.Close className="shrink-0 p-1" aria-label="Close website push preview" disabled={busy}><X size={20} /></Dialog.Close>
      </div>
      <div className="min-h-0 space-y-4 overflow-y-auto p-5">
        {loading && <p role="status" className="flex items-center gap-2 text-sm"><Loader2 size={16} className="animate-spin" />Preparing changes...</p>}
        {error && <p role="alert" className="border-l-2 border-rose-600 pl-3 text-sm">{error}</p>}
        {result ? <div role="status" className="space-y-3"><p className="flex items-center gap-2 font-semibold"><Check size={18} />{result.initialized ? `Changes pushed. Website feed revision ${result.revision}.` : "Planner changes approved. Website feed is still inactive."}</p>
          <p className="text-sm text-muted">{result.initialized ? "The symposium website will pick up this approved revision on its next refresh." : "In Website publishing, reload and review the complete initial speaker list, then select Activate approved list. The existing website content has not changed."}</p></div> : preview && <>
          {!preview.initialized && <p className="border-l-2 border-amber-600 pl-3 text-sm">Website publishing is not active yet. These approvals will wait until you review and activate the complete initial list in Website publishing. Existing website speakers will not be replaced by this action.</p>}
          <p className="text-sm font-semibold">{preview.changes.length ? `${preview.changes.length} profile changes to review` : "No planner changes to push."}</p>
          {preview.changes.map((change) => {
            const before = preview.before.find((p) => p.id === change.id)?.profile;
            return <section key={change.id} className="border-t border-line pt-4">
              <p className="text-sm font-semibold">{!change.profile ? "Remove" : before ? "Update" : "Add"}: {change.profile?.fullName ?? before?.fullName}</p>
              {before && <p className="mt-2 text-xs text-muted">Currently approved: {before.placements.map((p) => WEBSITE_SESSIONS[p.sessionId]).join(", ")}</p>}
              {change.profile ? <PublicProfilePreview profile={change.profile} /> : <p className="mt-2 text-sm">No longer assigned to either planner session. This person will be removed from the approved website list.</p>}
            </section>;
          })}
        </>}
      </div>
      <div className="space-y-3 border-t border-line p-5">
        {preview && preview.changes.length > 0 && !result && <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1 shrink-0" checked={consent} disabled={busy} onChange={(e) => setConsent(e.target.checked)} />I have reviewed all public details, headshots, session changes and removals above and approve them.</label>}
        <div className="flex flex-wrap justify-end gap-2"><Dialog.Close className={BUTTON} disabled={busy}>{result ? "Done" : "Cancel"}</Dialog.Close>
          {preview && preview.changes.length > 0 && !result && <button type="button" className={`${BUTTON} border-brand bg-brand text-white hover:opacity-90`} disabled={!consent || busy || loading} onClick={() => void publish()}>{busy ? <Loader2 size={16} className="animate-spin" /> : <CloudUpload size={16} />}{busy ? "Pushing..." : preview.initialized ? "Approve & push changes" : "Approve planner changes"}</button>}
        </div>
      </div>
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>;
}
