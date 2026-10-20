"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Crop, Loader2, Save, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { HeadshotCropper, type CropState, type HeadshotFraming } from "@/components/events/HeadshotCropper";

const COLOURS = {
  "--speaker-control-line": "var(--line)", "--speaker-control-bg": "var(--card-solid)",
  "--speaker-subtle": "var(--muted)", "--speaker-control-ink": "var(--fg)",
} as CSSProperties;

export function HeadshotAdjustButton({ slug, personId, speakerId, name, onSaved }: {
  slug: string; personId?: string; speakerId?: string; name: string; onSaved: (url: string) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState<{ file: File; version: string; framing?: HeadshotFraming } | null>(null);
  const [crop, setCrop] = useState<CropState | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const onCrop = useCallback((value: CropState) => setCrop(value), []);
  const api = `/api/admin/events/${encodeURIComponent(slug)}/headshot?${personId ? `personId=${encodeURIComponent(personId)}` : `speakerId=${encodeURIComponent(speakerId!)}`}`;

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setSource(null); setCrop(null); setError("");
    void (async () => {
      try {
        const response = await fetch(api, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error((await response.json()).error ?? "Couldn't load the photo.");
        const file = new File([await response.blob()], "original-headshot", { type: response.headers.get("content-type") ?? "image/png" });
        if (!controller.signal.aborted) setSource({ file, version: decodeURIComponent(response.headers.get("X-Headshot-Version")!), framing: JSON.parse(response.headers.get("X-Headshot-Framing") ?? "null") ?? undefined });
      } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Couldn't load the photo."); }
    })();
    return () => controller.abort();
  }, [open, api]);

  async function save() {
    if (busy || !crop?.framing || !source) return;
    setBusy(true); setError("");
    try {
      const blob = await crop.toBlob();
      if (!blob) throw new Error("The photo is still loading. Please retry.");
      const form = new FormData();
      form.set("headshot", blob, "headshot.png"); form.set("version", source.version); form.set("framing", JSON.stringify(crop.framing));
      const response = await fetch(api, { method: "POST", body: form });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Couldn't save the photo.");
      onSaved(body.photoUrl); setOpen(false); router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn't save the photo."); }
    finally { setBusy(false); }
  }

  return <Dialog.Root open={open} onOpenChange={(next) => { if (!busy) setOpen(next); }}>
    <Dialog.Trigger asChild><button type="button" aria-label={`Adjust headshot for ${name}`} className="inline-flex items-center gap-1.5 rounded-md border border-line px-2 py-1.5 text-[12px] font-semibold text-fg hover:bg-elevated"><Crop size={14} />Adjust headshot</button></Dialog.Trigger>
    <Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" /><Dialog.Content style={COLOURS} className="fixed left-1/2 top-1/2 z-50 max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg bg-card-solid p-5 text-fg shadow-xl">
      <div className="flex items-center justify-between gap-3"><Dialog.Title className="text-base font-bold">Adjust headshot</Dialog.Title><Dialog.Close disabled={busy} aria-label="Close headshot editor" className="rounded-md p-2 hover:bg-elevated"><X size={18} /></Dialog.Close></div>
      <p className="mt-1 text-sm font-semibold">{name}</p>
      <Dialog.Description className="mb-3 mt-1 text-[12px] text-muted">The original stays unchanged. Existing social graphics need a separate refresh.</Dialog.Description>
      {source ? <HeadshotCropper initialFile={source.file} initialFraming={source.framing} minZoom={0.5} adjustmentOnly onChange={onCrop} /> : !error && <div className="flex h-72 items-center justify-center" role="status"><Loader2 size={24} className="animate-spin" /><span className="sr-only">Loading original headshot</span></div>}
      {error && <p role="alert" className="mt-3 text-sm text-fg">{error}</p>}
      <div className="mt-4 flex justify-end gap-2"><Dialog.Close disabled={busy} className="rounded-md border border-line px-3 py-2 text-sm">Cancel</Dialog.Close><button type="button" disabled={busy || !crop?.file} onClick={() => void save()} className="inline-flex items-center gap-2 rounded-md bg-brand-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}Save headshot</button></div>
    </Dialog.Content></Dialog.Portal>
  </Dialog.Root>;
}
