"use client";

/**
 * Who else gets a copy of a submission — the internal BCC list attached
 * to the applicant confirmation, with the PDF packet, for the streams
 * that have one (VentureConnect, Innovation Fellowship). Used to be
 * hardcoded; now editable from here.
 */
import { useState } from "react";
import { Mail, Loader2, Check, X, Plus } from "lucide-react";

export interface CopyRecipients {
  venture_connect: string[];
  innovation_fellowship: string[];
}

const STREAM_LABEL: Record<keyof CopyRecipients, string> = {
  venture_connect: "VentureConnect",
  innovation_fellowship: "Innovation Fellowship",
};

function StreamEditor({
  stream, initial, canEdit,
}: {
  stream: keyof CopyRecipients;
  initial: string[];
  canEdit: boolean;
}) {
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState(initial);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function addEmail() {
    const v = input.trim().toLowerCase();
    if (!v) return;
    if (!EMAIL.test(v)) { setError(`"${v}" doesn't look like an email address.`); return; }
    if (draft.includes(v)) { setInput(""); return; }
    setDraft([...draft, v]);
    setInput("");
    setError(null);
  }
  function removeEmail(v: string) {
    setDraft(draft.filter((e) => e !== v));
  }

  async function save() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/equip/email-templates/copy-recipients", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stream, emails: draft }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string; recipients?: CopyRecipients };
      if (!res.ok) throw new Error(j.error ?? "Save failed.");
      const next = j.recipients?.[stream] ?? draft;
      setSaved(next);
      setDraft(next);
      setNotice(next.length === 0 ? "Saved — nobody gets a copy on this stream now." : "Saved.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-line bg-card-solid p-3.5">
      <p className="text-[12.5px] font-bold text-fg">{STREAM_LABEL[stream]}</p>
      <p className="mt-0.5 text-[11px] text-muted">
        BCC&apos;d on the submission confirmation, with the PDF application packet attached. Applicants never see this list.
      </p>

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {draft.length === 0 && (
          <span className="text-[11.5px] italic text-subtle">Nobody — submissions aren&apos;t copied anywhere.</span>
        )}
        {draft.map((email) => (
          <span
            key={email}
            className="inline-flex items-center gap-1.5 rounded-full bg-elevated px-2.5 py-1 text-[11.5px] font-medium text-fg"
          >
            {email}
            {canEdit && (
              <button
                type="button"
                onClick={() => removeEmail(email)}
                className="text-subtle hover:text-rose-700"
                aria-label={`Remove ${email}`}
              >
                <X size={11} />
              </button>
            )}
          </span>
        ))}
      </div>

      {canEdit && (
        <>
          <div className="mt-2.5 flex items-center gap-2">
            <input
              value={input}
              onChange={(e) => { setInput(e.target.value); setError(null); }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addEmail(); } }}
              placeholder="name@biohubnet.ca"
              className="min-w-0 flex-1 rounded-md border border-line bg-elevated/40 px-2.5 py-1.5 text-[12.5px] focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
            <button
              type="button"
              onClick={addEmail}
              disabled={!input.trim()}
              className="inline-flex items-center gap-1 rounded-md border border-line bg-card-solid px-2.5 py-1.5 text-[11.5px] font-semibold text-fg hover:bg-elevated disabled:opacity-50"
            >
              <Plus size={12} /> Add
            </button>
          </div>

          {error && <p className="mt-1.5 text-[11px] font-medium text-rose-700">{error}</p>}
          {notice && !dirty && <p className="mt-1.5 text-[11px] font-medium text-brand-700">{notice}</p>}

          {dirty && (
            <div className="mt-2.5 flex items-center gap-2">
              <button
                type="button"
                onClick={save}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-3.5 py-1.5 text-[12px] font-bold text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                Save
              </button>
              <button
                type="button"
                onClick={() => { setDraft(saved); setInput(""); setError(null); }}
                disabled={busy}
                className="text-[12px] font-semibold text-muted hover:text-fg"
              >
                Revert
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function EquipCopyRecipients({
  initial,
  canEdit,
}: {
  initial: CopyRecipients;
  canEdit: boolean;
}) {
  return (
    <div className="space-y-3">
      <div>
        <p className="flex items-center gap-1.5 text-sm font-bold text-fg">
          <Mail size={14} className="text-brand-600" /> Internal copy recipients
        </p>
        <p className="text-[11.5px] text-muted">
          Who else receives a copy of a submitted application. Editable per stream — VentureLift isn&apos;t listed because it doesn&apos;t generate a PDF packet.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <StreamEditor stream="venture_connect" initial={initial.venture_connect} canEdit={canEdit} />
        <StreamEditor stream="innovation_fellowship" initial={initial.innovation_fellowship} canEdit={canEdit} />
      </div>
    </div>
  );
}
