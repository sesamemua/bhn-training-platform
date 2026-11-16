"use client";

import { useId, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ImagePlus, Loader2, Pencil, Trash2 } from "lucide-react";
import { IMAGE_TYPES, MAX_ASSET_BYTES } from "@/lib/assets/core";
import type { NewsletterImage } from "@/lib/newsletter/types";
import { fitPicture } from "./PictureDrop";

export function NewsletterImages({ issueId, targetType, targetId, label, images, disabled, onChange, onBusyChange }: {
  issueId: string;
  targetType: "section" | "piece";
  targetId: string;
  label: string;
  images: NewsletterImage[];
  disabled?: boolean;
  onChange: (images: NewsletterImage[]) => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [editing, setEditing] = useState<{ id: string; alt: string } | null>(null);
  const endpoint = `/api/workspace/newsletter/${issueId}/images`;

  async function upload(files: File[]) {
    if (disabled || busy || !files.length) return;
    setBusy(true);
    onBusyChange?.(true);
    setErrors([]);
    const failures: string[] = [];
    let uploaded = 0;
    try {
      // One request per picture stays below Vercel's 4.5 MB request-body limit.
      for (const [index, original] of files.entries()) {
        setProgress(`Uploading picture ${index + 1} of ${files.length}…`);
        if (!(IMAGE_TYPES as readonly string[]).includes(original.type)) {
          failures.push(`${original.name}: use PNG, JPEG, WebP or GIF.`);
          continue;
        }
        const file = await fitPicture(original, MAX_ASSET_BYTES, 3600).catch(() => original);
        if (file.size > MAX_ASSET_BYTES) {
          failures.push(`${original.name}: still over 4.3 MB after resizing. Choose a smaller picture.`);
          continue;
        }
        const data = new FormData();
        data.set("targetType", targetType);
        data.set("targetId", targetId);
        data.append("files", file);
        try {
          const response = await fetch(endpoint, { method: "POST", body: data });
          const result = await response.json().catch(() => ({}));
          if (!response.ok || !result.ok || !Array.isArray(result.images)) {
            failures.push(`${original.name}: ${result.error ?? "Upload failed. Please try again."}`);
            continue;
          }
          onChange(result.images);
          if (result.errors?.length) failures.push(...result.errors);
          else uploaded++;
        } catch {
          failures.push(`${original.name}: connection lost. Please try this picture again.`);
        }
      }
      setErrors(failures);
      setProgress(uploaded ? `${uploaded} ${uploaded === 1 ? "picture" : "pictures"} saved.` : "No new pictures saved.");
    } finally {
      setBusy(false);
      onBusyChange?.(false);
    }
  }

  async function change(action: "remove" | "updateAlt" | "reorder", payload: Record<string, unknown>) {
    if (disabled || busy) return;
    setBusy(true);
    onBusyChange?.(true);
    setErrors([]);
    setProgress("");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, targetType, targetId, ...payload }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok || !Array.isArray(result.images)) {
        setErrors([result.error ?? "Couldn't save that change. Please try again."]);
        return;
      }
      onChange(result.images);
      setEditing(null);
      setProgress("Picture changes saved.");
    } catch {
      setErrors(["Could not confirm the change. Reload to check your pictures before trying again."]);
    } finally {
      setBusy(false);
      onBusyChange?.(false);
    }
  }

  function move(index: number, direction: number) {
    const imageIds = images.map((image) => image.id);
    [imageIds[index], imageIds[index + direction]] = [imageIds[index + direction], imageIds[index]];
    void change("reorder", { imageIds });
  }

  return (
    <div className="space-y-2 border-t border-line pt-3" aria-label={`Pictures for ${label}`} aria-busy={busy}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold text-fg">
          {targetType === "section" ? "Section pictures" : "Pictures for this item"}
          {images.length > 0 && <span className="ml-1.5 font-normal text-muted">({images.length})</span>}
        </p>
        {!disabled && <>
          <button type="button" disabled={busy || images.length >= 20} onClick={() => input.current?.click()}
            aria-label={`Upload pictures for ${label}`}
            className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-brand-500 disabled:opacity-50">
            {busy ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <ImagePlus size={13} aria-hidden />}
            Upload pictures
          </button>
          <input ref={input} id={id} type="file" multiple accept={IMAGE_TYPES.join(",")} disabled={busy || images.length >= 20}
            aria-label={`Choose pictures for ${label}`} className="hidden"
            onChange={async (event) => {
              const files = Array.from(event.currentTarget.files ?? []);
              event.currentTarget.value = "";
              await upload(files);
            }} />
        </>}
      </div>
      {!disabled && <p className="text-xs leading-relaxed text-muted">
        Select several pictures at once, up to 20 per {targetType === "section" ? "section" : "item"}. PNG, JPEG, WebP or GIF; large photos are resized to fit.
        {targetType === "section" ? " These appear at the start of this section." : " These stay with this item."}
      </p>}
      {images.length > 0 && <ul className="space-y-2">
        {images.map((image, index) => (
          <li key={image.id} className="flex items-start gap-3">
            <a href={image.url} target="_blank" rel="noreferrer" className="shrink-0 rounded border border-line bg-white focus-visible:outline-2 focus-visible:outline-brand-500"
              aria-label={`Open picture ${index + 1} for ${label}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image.url} alt={image.alt} className="h-20 w-24 object-contain" loading="lazy" />
            </a>
            <div className="min-w-0 flex-1">
              {editing && editing.id === image.id ? (
                <form className="space-y-1.5" onSubmit={(event) => { event.preventDefault(); void change("updateAlt", { imageId: image.id, alt: editing.alt.trim() }); }}>
                  <label htmlFor={`${id}-alt-${image.id}`} className="text-xs font-medium text-fg">Alt text</label>
                  <input id={`${id}-alt-${image.id}`} value={editing.alt} maxLength={400} autoFocus disabled={busy}
                    onChange={(event) => setEditing({ id: image.id, alt: event.target.value })}
                    className="w-full rounded-md border border-line bg-card px-2 py-1.5 text-xs text-fg focus:outline-brand-500" />
                  <div className="flex gap-3 text-xs">
                    <button type="submit" disabled={busy} className="font-semibold text-brand-700 disabled:opacity-50">Save alt text</button>
                    <button type="button" disabled={busy} onClick={() => setEditing(null)} className="text-muted disabled:opacity-50">Cancel</button>
                  </div>
                </form>
              ) : (
                <>
                  <p className="break-words text-xs leading-relaxed text-muted">{image.alt || "No alt text — add a short description for accessibility."}</p>
                  {!disabled && <div className="mt-1 flex flex-wrap items-center gap-1">
                    <button type="button" disabled={busy} aria-label={`Edit alt text for picture ${index + 1} in ${label}`}
                      onClick={() => setEditing({ id: image.id, alt: image.alt })}
                      className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-xs text-brand-700 hover:bg-raised disabled:opacity-50"><Pencil size={12} aria-hidden /> Alt text</button>
                    <button type="button" disabled={busy || index === 0} aria-label={`Move picture ${index + 1} earlier in ${label}`} onClick={() => move(index, -1)}
                      className="rounded p-1.5 text-muted hover:bg-raised disabled:opacity-30"><ArrowUp size={13} aria-hidden /></button>
                    <button type="button" disabled={busy || index === images.length - 1} aria-label={`Move picture ${index + 1} later in ${label}`} onClick={() => move(index, 1)}
                      className="rounded p-1.5 text-muted hover:bg-raised disabled:opacity-30"><ArrowDown size={13} aria-hidden /></button>
                    <button type="button" disabled={busy} aria-label={`Remove picture ${index + 1} from ${label}`} onClick={() => void change("remove", { imageId: image.id })}
                      className="rounded p-1.5 text-rose-700 hover:bg-rose-50 disabled:opacity-50"><Trash2 size={13} aria-hidden /></button>
                  </div>}
                </>
              )}
            </div>
          </li>
        ))}
      </ul>}
      {disabled && images.length === 0 && <p className="text-xs text-muted">No pictures attached.</p>}
      <p role="status" aria-live="polite" className="text-xs text-muted">{progress}</p>
      {errors.length > 0 && <ul role="alert" className="space-y-1 text-xs text-rose-700">{errors.map((error, index) => <li key={index}>{error}</li>)}</ul>}
    </div>
  );
}
