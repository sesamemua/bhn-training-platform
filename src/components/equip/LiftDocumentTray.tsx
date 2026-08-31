"use client";
/** Shared drag-and-drop attachment tray for EQUIP application forms. */
import { useRef, useState } from "react";
import { Loader2, Upload, Trash2, FileText, Image as ImageIcon, FilmIcon, Mail, FileCheck2, FileSignature } from "lucide-react";
import type { EquipDocument } from "@/lib/equip/types";

type KindMeta = {
  id: EquipDocument["kind"];
  label: string;
  hint: string;
  accept: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
};

/** Stage-1 / pitch-style attachments — drafts of VC + VL pre-screening. */
const STAGE_1_KINDS: KindMeta[] = [
  { id: "pitch_deck",      label: "Pitch deck",         hint: "PDF, up to 25 MB",          accept: ".pdf,application/pdf", icon: FileText },
  { id: "prototype_photo", label: "Prototype photo",    hint: "JPG / PNG, multiple OK",     accept: "image/jpeg,image/png,.jpg,.jpeg,.png", icon: ImageIcon },
  { id: "letter",          label: "Recommendation",     hint: "PDF / DOC",                  accept: ".pdf,application/pdf,.doc,.docx", icon: Mail },
  { id: "video_pitch",     label: "Video pitch",        hint: "MP4, up to 25 MB",          accept: "video/mp4,.mp4", icon: FilmIcon },
];

/** VentureConnect asks for supporting evidence rather than four
 *  stage-specific media categories. One repeatable slot keeps that
 *  requirement aligned with the paper form and its checklist. */
export const VENTURE_CONNECT_KINDS: KindMeta[] = [
  {
    id: "other",
    label: "Supporting file",
    hint: "PDF, Word, Excel, JPG or PNG, up to 25 MB",
    accept: ".pdf,application/pdf,.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,image/jpeg,image/png,.jpg,.jpeg,.png",
    icon: FileCheck2,
  },
];

/** Stage-2 appendix kinds — matches the VentureLift full
 *  application PDF's Part 4 (Appendices 1–3). */
export const STAGE_2_KINDS: KindMeta[] = [
  { id: "cv",             label: "Appendix 1 — CVs",            hint: "Primary applicant + PI, single PDF, ≤ 2 pages each", accept: ".pdf,application/pdf", icon: FileSignature },
  { id: "support_letter", label: "Appendix 2 — Support letters", hint: "Up to 3 PDFs from non-service-provider stakeholders", accept: ".pdf,application/pdf,.doc,.docx", icon: Mail },
  { id: "ip_doc",         label: "Appendix 3 — IP documents",    hint: "Provisional patent, application receipt, license agreement", accept: ".pdf,application/pdf", icon: FileCheck2 },
];

interface Props {
  applicationId: string;
  documents: EquipDocument[];
  onChange: (next: EquipDocument[]) => void;
  /** Optional override of which kinds the tray surfaces. Defaults
   *  to Stage-1 (pitch deck etc.) so existing call sites are
   *  unchanged. Pass STAGE_2_KINDS from VL Stage-2 forms. */
  kinds?: KindMeta[];
  /** Override header copy. */
  title?: string;
  /** Override sub-copy. */
  blurb?: string;
  /** Base route for upload and delete requests. Public applications
   *  use their token route; signed-in applications keep the default. */
  endpointBase?: string;
  /** Remove the outer card treatment when the tray belongs inside
   *  a larger form section. */
  embedded?: boolean;
}

export function LiftDocumentTray({
  applicationId,
  documents,
  onChange,
  kinds,
  title,
  blurb,
  endpointBase = "/api/equip/applications",
  embedded = false,
}: Props) {
  const KINDS = kinds ?? STAGE_1_KINDS;
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const documentEndpoint = `${endpointBase}/${encodeURIComponent(applicationId)}/document`;

  async function upload(file: File, kind: EquipDocument["kind"]) {
    setBusy(kind);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", kind);
      const res = await fetch(documentEndpoint, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? "Upload failed");
      }
      const j = (await res.json()) as { document: EquipDocument };
      onChange([...documents, j.document]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function remove(key: string) {
    setBusy("delete-" + key);
    setError(null);
    try {
      const res = await fetch(`${documentEndpoint}?key=${encodeURIComponent(key)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? "Delete failed");
      }
      onChange(documents.filter((d) => d.key !== key));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className={embedded ? "space-y-3" : "rounded-2xl border border-line bg-card p-4 space-y-3 surface-shadow"}>
      <header className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-fg">{title ?? "Attachments"}</h3>
        {!kinds && (
          <span className="text-[10px] font-bold uppercase tracking-wider bg-elevated text-muted ring-1 ring-line px-1.5 py-0.5 rounded">
            All optional
          </span>
        )}
      </header>
      <p className="text-[11px] text-muted leading-snug">
        {blurb ?? "Reviewers can request more in-platform once you submit — no need to over-attach now."}
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {KINDS.map((k) => (
          <KindSlot
            key={k.id}
            kind={k}
            busy={busy === k.id}
            onUpload={(f) => upload(f, k.id)}
          />
        ))}
      </div>

      {documents.length > 0 && (
        <ul className="space-y-1.5 pt-2 border-t border-line">
          {documents.map((d) => {
            const kindMeta = KINDS.find((k) => k.id === d.kind);
            const Icon = kindMeta?.icon ?? FileText;
            return (
              <li key={d.key} className="flex items-center gap-2 text-xs">
                <Icon size={13} className="text-muted shrink-0" />
                <span className="text-fg font-semibold truncate flex-1">{d.name}</span>
                <span className="text-[10px] text-subtle tabular-nums">{Math.round(d.size / 1024)} KB</span>
                <button
                  type="button"
                  onClick={() => remove(d.key)}
                  disabled={busy === "delete-" + d.key}
                  className="text-rose-700 hover:text-rose-800 disabled:opacity-50"
                >
                  {busy === "delete-" + d.key ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {error && <p className="text-[11px] text-rose-700">{error}</p>}
    </section>
  );
}

function KindSlot({
  kind, busy, onUpload,
}: {
  kind: { id: EquipDocument["kind"]; label: string; hint: string; accept: string; icon: React.ComponentType<{ size?: number; className?: string }> };
  busy: boolean;
  onUpload: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const Icon = kind.icon;

  function receive(file: File | undefined) {
    if (!file || busy) return;
    onUpload(file);
  }

  return (
    <label
      onDragEnter={(event) => {
        event.preventDefault();
        if (!busy) setDragActive(true);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        if (!busy) setDragActive(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setDragActive(false);
        }
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragActive(false);
        receive(event.dataTransfer.files?.[0]);
      }}
      aria-busy={busy}
      className={
        "rounded-xl border border-dashed p-3 transition-colors block " +
        (busy
          ? "cursor-wait opacity-70 border-line bg-elevated/30"
          : dragActive
            ? "cursor-copy border-brand-500 bg-brand-50/40 ring-2 ring-brand-500/20"
            : "cursor-pointer border-line bg-elevated/30 hover:border-brand-300 hover:bg-elevated/60")
      }
    >
      <input
        ref={inputRef}
        type="file"
        accept={kind.accept}
        disabled={busy}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          receive(f);
          if (inputRef.current) inputRef.current.value = "";
        }}
      />
      <div className="flex items-start gap-2">
        <span className="w-7 h-7 rounded-lg bg-brand-50 text-brand-700 flex items-center justify-center shrink-0">
          {busy ? <Loader2 size={12} className="animate-spin" /> : <Icon size={12} />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-bold text-fg">{kind.label}</span>
          <span className="block text-[10px] text-muted">{kind.hint}</span>
          <span className="block text-[10px] font-semibold text-brand-700 mt-0.5">
            {dragActive ? "Drop to attach" : "Drag and drop or click to browse"}
          </span>
        </span>
        <Upload size={11} className="text-muted shrink-0 mt-1" />
      </div>
    </label>
  );
}
