"use client";

/**
 * Pictures for a newsletter section or item, as one compact strip:
 * thumbnails plus a "+" tile. Drop files on the strip or click "+".
 * Per-picture actions (alt text, move, remove) appear on hover / focus;
 * a dot marks a picture still missing alt text.
 */
import { useId, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ImagePlus, Loader2, Type, X } from "lucide-react";
import { IMAGE_TYPES, MAX_ASSET_BYTES } from "@/lib/assets/core";
import type { NewsletterImage } from "@/lib/newsletter/types";
import { fitPicture } from "./PictureDrop";
import { cn } from "@/lib/utils";

const MAX = 20;

export function NewsletterImages({ issueId, targetType, targetId, label, images, disabled, onChange, onBusyChange, size = "md" }: {
  issueId: string;
  targetType: "section" | "piece";
  targetId: string;
  label: string;
  images: NewsletterImage[];
  disabled?: boolean;
  onChange: (images: NewsletterImage[]) => void;
  onBusyChange?: (busy: boolean) => void;
  /** md = section strip (48px tiles); sm = item strip (36px). */
  size?: "sm" | "md";
}) {
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [editing, setEditing] = useState<{ id: string; alt: string } | null>(null);
  const [over, setOver] = useState(false);
  const endpoint = `/api/workspace/newsletter/${issueId}/images`;
  const tile = size === "sm" ? "h-9 w-9" : "h-12 w-12";
  const full = images.length >= MAX;

  async function upload(files: File[]) {
    if (disabled || busy || !files.length) return;
    setBusy(true);
    onBusyChange?.(true);
    setErrors([]);
    const failures: string[] = [];
    try {
      // One request per picture stays below Vercel's 4.5 MB request-body limit.
      for (const [index, original] of files.slice(0, MAX - images.length).entries()) {
        setProgress(files.length > 1 ? `${index + 1}/${files.length}` : "");
        if (!(IMAGE_TYPES as readonly string[]).includes(original.type)) {
          failures.push(`${original.name}: use PNG, JPEG, WebP or GIF.`);
          continue;
        }
        const file = await fitPicture(original, MAX_ASSET_BYTES, 3600).catch(() => original);
        if (file.size > MAX_ASSET_BYTES) { failures.push(`${original.name}: too large even after resizing.`); continue; }
        const data = new FormData();
        data.set("targetType", targetType);
        data.set("targetId", targetId);
        data.append("files", file);
        try {
          const response = await fetch(endpoint, { method: "POST", body: data });
          const result = await response.json().catch(() => ({}));
          if (!response.ok || !result.ok || !Array.isArray(result.images)) {
            failures.push(`${original.name}: ${result.error ?? "upload failed."}`);
            continue;
          }
          onChange(result.images);
          if (result.errors?.length) failures.push(...result.errors);
        } catch {
          failures.push(`${original.name}: connection lost — try again.`);
        }
      }
      setErrors(failures);
    } finally {
      setProgress("");
      setBusy(false);
      onBusyChange?.(false);
    }
  }

  async function change(action: "remove" | "updateAlt" | "reorder", payload: Record<string, unknown>) {
    if (disabled || busy) return;
    setBusy(true);
    onBusyChange?.(true);
    setErrors([]);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, targetType, targetId, ...payload }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok || !Array.isArray(result.images)) {
        setErrors([result.error ?? "Couldn't save that change."]);
        return;
      }
      onChange(result.images);
      setEditing(null);
    } catch {
      setErrors(["Couldn't confirm the change — reload to check."]);
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

  if (disabled && images.length === 0) return null;

  const iconBtn = "flex h-5 w-5 items-center justify-center rounded bg-black/65 text-white hover:bg-black/85 focus-visible:outline-2 focus-visible:outline-white disabled:opacity-40";

  return (
    <div aria-label={`Pictures for ${label}`} aria-busy={busy} className="min-w-0">
      <ul
        className={cn("flex flex-wrap items-center gap-1.5 rounded-lg transition-colors", over && "bg-brand-50 ring-2 ring-brand-300")}
        onDragOver={(e) => { if (!disabled && e.dataTransfer.types.includes("Files")) { e.preventDefault(); setOver(true); } }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); void upload(Array.from(e.dataTransfer.files)); }}
      >
        {images.map((image, index) => (
          <li key={image.id} className={cn("group relative shrink-0 overflow-hidden rounded-md border border-line bg-white", tile)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image.url} alt={image.alt} title={image.alt || "No alt text yet"} className="h-full w-full object-cover" loading="lazy" />
            {!image.alt && <span aria-hidden className="absolute right-0.5 top-0.5 h-2 w-2 rounded-full bg-amber-500 ring-1 ring-white" title="Add alt text" />}
            {!disabled && (
              <span className="absolute inset-0 flex flex-wrap content-center items-center justify-center gap-0.5 bg-black/20 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
                <button type="button" disabled={busy} aria-label={`Alt text for picture ${index + 1} in ${label}`} title="Alt text"
                  onClick={() => setEditing({ id: image.id, alt: image.alt })} className={iconBtn}><Type size={11} aria-hidden /></button>
                <button type="button" disabled={busy} aria-label={`Remove picture ${index + 1} from ${label}`} title="Remove"
                  onClick={() => void change("remove", { imageId: image.id })} className={iconBtn}><X size={11} aria-hidden /></button>
                {images.length > 1 && size === "md" && <>
                  <button type="button" disabled={busy || index === 0} aria-label={`Move picture ${index + 1} earlier`} title="Earlier"
                    onClick={() => move(index, -1)} className={iconBtn}><ChevronLeft size={11} aria-hidden /></button>
                  <button type="button" disabled={busy || index === images.length - 1} aria-label={`Move picture ${index + 1} later`} title="Later"
                    onClick={() => move(index, 1)} className={iconBtn}><ChevronRight size={11} aria-hidden /></button>
                </>}
              </span>
            )}
          </li>
        ))}
        {!disabled && !full && (
          <li className="shrink-0">
            <button type="button" disabled={busy} onClick={() => input.current?.click()}
              aria-label={`Add pictures to ${label}`}
              title={`Add pictures (${images.length}/${MAX}) — or drop them here. Public links: nothing confidential.`}
              className={cn(
                "flex items-center justify-center gap-1 rounded-md border border-dashed border-line-strong text-muted hover:border-brand-400 hover:text-brand-700 focus-visible:outline-2 focus-visible:outline-brand-500 disabled:opacity-50",
                images.length === 0 && size === "md" ? "h-8 px-2.5 text-[11.5px] font-semibold" : size === "sm" ? "h-7 w-7" : tile,
              )}>
              {busy ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <ImagePlus size={13} aria-hidden />}
              {images.length === 0 && size === "md" && (busy && progress ? progress : "Pictures")}
            </button>
            <input ref={input} id={id} type="file" multiple accept={IMAGE_TYPES.join(",")} className="hidden"
              aria-label={`Choose pictures for ${label}`}
              onChange={async (event) => {
                const files = Array.from(event.currentTarget.files ?? []);
                event.currentTarget.value = "";
                await upload(files);
              }} />
          </li>
        )}
      </ul>

      {editing && (
        <form className="mt-1.5 flex items-center gap-1.5" onSubmit={(event) => { event.preventDefault(); void change("updateAlt", { imageId: editing.id, alt: editing.alt.trim() }); }}>
          <label htmlFor={`${id}-alt`} className="sr-only">Alt text</label>
          <input id={`${id}-alt`} value={editing.alt} maxLength={400} autoFocus disabled={busy} placeholder="Describe the picture"
            onChange={(event) => setEditing({ id: editing.id, alt: event.target.value })}
            onKeyDown={(event) => { if (event.key === "Escape") setEditing(null); }}
            className="min-w-0 flex-1 rounded-md border border-line bg-card px-2 py-1 text-xs text-fg focus:outline-brand-500" />
          <button type="submit" disabled={busy} className="rounded-md bg-brand-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50">Save</button>
          <button type="button" disabled={busy} onClick={() => setEditing(null)} aria-label="Cancel" className="rounded p-1 text-muted hover:text-fg"><X size={13} aria-hidden /></button>
        </form>
      )}

      {errors.length > 0 && (
        <p role="alert" className="mt-1 truncate text-[11px] text-rose-700" title={errors.join("\n")}>
          {errors.length === 1 ? errors[0] : `${errors.length} pictures failed — hover for details.`}
        </p>
      )}
    </div>
  );
}
