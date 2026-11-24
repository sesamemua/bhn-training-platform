"use client";

import { useEffect, useId, useRef, useState, type CSSProperties, type FormEvent, type PointerEvent } from "react";
import { FlipHorizontal2, RotateCcw, RotateCw, Trash2, Undo2 } from "lucide-react";
import type { ReportPhoto } from "@/lib/symposium-report/document";
import { photoAdjust, photoLabel, REPORT_ASSETS } from "@/lib/symposium-report/photos";
import { REPORT_API } from "@/lib/symposium-report/document";
import { PHOTO_UPLOAD_LIMIT, type GalleryEntry, type GalleryGroup } from "@/lib/symposium-report/gallery";
import styles from "./report.module.css";

/** The img's zoom, mirror and turn; zooms toward the crop focus. */
function adjustStyle(photo: ReportPhoto): CSSProperties {
  const { scale, rotate, turned } = photoAdjust(photo);
  return { scale, rotate, transformOrigin: turned ? "center" : `${photo.x}% ${photo.y}%` };
}

export function PhotoFigure({ photo, height, lead = false, caption = true, slot }: {
  photo: ReportPhoto; height: number; lead?: boolean; caption?: boolean;
  /** Which saved photo this is ("" for the page's main photo): clicking it opens the photo editor. */
  slot?: string;
}) {
  const source = `${REPORT_ASSETS}/${photo.file}`;
  const label = photoLabel(photo);
  const style = {
    aspectRatio: `684 / ${height}`,
    "--photo-background": `url("${source}")`,
    "--photo-focus": `${photo.x}% ${photo.y}%`,
  } as CSSProperties;
  return (
    <figure className={lead ? styles.photo : styles.fillPhoto} data-report-photo={photo.file} data-photo-slot={slot}>
      <div className={styles.photoMat} style={style} data-fit={photo.fit} data-turned={photoAdjust(photo).turned || undefined}>
        {/* eslint-disable-next-line @next/next/no-img-element -- same authenticated artwork for preview and print */}
        <img src={source} alt={label} style={adjustStyle(photo)} />
      </div>
      {caption && <figcaption>{label}</figcaption>}
    </figure>
  );
}

export function CoverArt({ photo }: { photo: ReportPhoto }) {
  return (
    <div className={styles.coverArt} aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element -- original artwork for the print cover */}
      <img className={styles.coverCrystal} src={`${REPORT_ASSETS}/recap-optical-passage.webp`} alt="" />
      {/* eslint-disable-next-line @next/next/no-img-element -- original event photo for the print cover */}
      <img className={styles.coverEvent} src={`${REPORT_ASSETS}/${photo.file}`} alt="" data-photo-slot=""
        style={{ objectPosition: `${photo.x}% ${photo.y}%`, ...adjustStyle({ ...photo, rotate: undefined }) }} />
    </div>
  );
}

function galleryChoice({ file, label }: GalleryEntry): ReportPhoto {
  return { file, caption: label, x: 50, y: 28, fit: "cover" };
}

async function photoForUpload(file: File) {
  if (file.size <= PHOTO_UPLOAD_LIMIT) return file;
  if (file.size > 25_000_000) throw new Error("Choose a photograph under 25 MB.");
  const image = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1600 / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser couldn’t resize the photo.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", .86));
    if (!blob || blob.size > PHOTO_UPLOAD_LIMIT) throw new Error("Choose a smaller copy of this photo.");
    return new File([blob], file.name, { type: "image/webp" });
  } finally { image.close(); }
}

export function PhotoEditor({ initial, automatic, height, section, cover, secondary, portrait, onApply, onRemove, onCancel }: {
  initial?: ReportPhoto;
  automatic: ReportPhoto;
  height: number;
  section: string;
  cover: boolean;
  secondary: boolean;
  portrait: boolean;
  onApply: (photo: ReportPhoto | undefined) => void;
  /** Take the photo off the page; absent on the cover. */
  onRemove?: () => void;
  onCancel: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const node = dialog.current;
    const previous = document.activeElement;
    node?.showModal();
    return () => {
      node?.close();
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  const [selected, setSelected] = useState(initial);
  const [groups, setGroups] = useState<GalleryGroup[] | null>(null);
  const [groupId, setGroupId] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const group = groups?.find((item) => item.id === groupId)
    ?? groups?.find((item) => item.photos.some(({ file }) => file === (initial ?? automatic).file))
    ?? groups?.[0];
  const photo = selected ?? automatic;
  const fixedCrop = cover || portrait;

  useEffect(() => {
    const abort = new AbortController();
    fetch(`${REPORT_API}/photos?section=${encodeURIComponent(section)}`, { signal: abort.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("The session gallery couldn’t be loaded.");
        setGroups((await response.json()).groups);
      })
      .catch((err: unknown) => {
        if (!abort.signal.aborted) {
          setGroups([]);
          setError(err instanceof Error ? err.message : "The session gallery couldn’t be loaded.");
        }
      });
    return () => abort.abort();
  }, [section]);

  async function upload(file?: File) {
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const payload = new FormData();
      payload.append("section", section);
      payload.append("photo", await photoForUpload(file));
      const response = await fetch(`${REPORT_API}/photos`, { method: "POST", body: payload });
      const item = await response.json();
      if (!response.ok) throw new Error(item.error || "This photo couldn’t be uploaded.");
      setGroups((current) => {
        const list = (current ?? []).filter((entry) => entry.id !== "local");
        const local = current?.find((entry) => entry.id === "local")?.photos ?? [];
        return [...list, { id: "local", title: "Uploaded for this section", photos: [item, ...local.filter((entry) => entry.file !== item.file)] }];
      });
      setGroupId("local");
      setSelected(galleryChoice(item));
    } catch (err) { setError(err instanceof Error ? err.message : "This photo couldn’t be uploaded."); }
    finally { setUploading(false); }
  }
  const setCrop = (axis: "x" | "y", value: number) => setSelected({ ...photo, [axis]: value });
  const adjust = (patch: Partial<ReportPhoto>) => setSelected({ ...photo, ...patch });
  const turn = (by: 90 | 270) => adjust({ rotate: (((photo.rotate ?? 0) + by) % 360) as ReportPhoto["rotate"] });
  // Drag the preview to move the crop; the image follows the pointer.
  const drag = useRef<{ x: number; y: number; px: number; py: number; w: number; h: number } | null>(null);
  function startDrag(event: PointerEvent<HTMLDivElement>) {
    if (!fixedCrop && photo.fit === "whole") return;
    const rect = event.currentTarget.getBoundingClientRect();
    drag.current = { x: photo.x, y: photo.y, px: event.clientX, py: event.clientY, w: rect.width, h: rect.height };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function moveDrag(event: PointerEvent<HTMLDivElement>) {
    const start = drag.current;
    if (!start) return;
    const clamp = (n: number) => Math.round(Math.min(100, Math.max(0, n)));
    const flip = photo.flip ? -1 : 1;
    setSelected({ ...photo, x: clamp(start.x - flip * (event.clientX - start.px) / start.w * 100), y: clamp(start.y - (event.clientY - start.py) / start.h * 100) });
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const chosen = selected && { ...selected, caption: selected.caption?.trim() || undefined, hidden: undefined };
    if (!uploading) onApply(chosen && portrait ? { ...chosen, fit: "cover" } : chosen);
  }

  return (
    <dialog ref={dialog} className={`${styles.photoDialog} report-screen-only`} aria-labelledby={titleId}
      onCancel={(event) => { event.preventDefault(); onCancel(); }}>
    <form className={styles.editForm} onSubmit={submit}>
      <div className={styles.editHeader}>
        <div><p>{cover ? "Cover photograph" : portrait ? "Panel portrait" : "Page photograph"}</p><h2 id={titleId}>Swap or crop photo</h2></div>
        <div>
          {onRemove && <button type="button" onClick={onRemove}><Trash2 size={14} aria-hidden /> Remove photo</button>}
          <button type="button" onClick={onCancel}>Cancel</button>
        </div>
      </div>
      <div className={styles.photoWorkbench}>
        <div className={styles.photoChoices}>
          {groups === null ? <p role="status">Loading final event photos…</p> : group ? <>
            <label>Session photos
              <select aria-label="Session photos" data-report-photo-picker="" value={group.id} onChange={(event) => setGroupId(event.target.value)}>
                {groups.map(({ id, title, photos }) => <option key={id} value={id}>{title} · {photos.length}</option>)}
              </select>
            </label>
            <div className={styles.photoThumbnails} role="group" aria-label={group.title}>
              {group.photos.map((item) => <button type="button" key={item.file} aria-pressed={photo.file === item.file}
                onClick={() => setSelected(galleryChoice(item))}>
                {/* eslint-disable-next-line @next/next/no-img-element -- private gallery asset */}
                <img src={`${REPORT_ASSETS}/${item.file}`} alt="" loading="lazy" />
                <span>{item.label}</span>
              </button>)}
            </div>
          </> : <p>No final session photos are available yet.</p>}
          <label className={styles.photoUpload}>Choose a photo from this device
            <input aria-label="Choose a photo from this device" data-report-photo-picker={!group ? "" : undefined} type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading}
              onChange={(event) => { void upload(event.target.files?.[0]); event.target.value = ""; }} />
          </label>
          {uploading && <p role="status">Adding the photo to this section…</p>}
          {error && <p role="alert" className={styles.error}>{error}</p>}
        </div>
        <div className={styles.photoPreview}>
          <div className={styles.photoDrag} style={{ "--photo-preview-ratio": 684 / height } as CSSProperties} onPointerDown={startDrag} onPointerMove={moveDrag}
            onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} title="Drag to move the crop">
            <PhotoFigure photo={fixedCrop ? { ...photo, fit: "cover" } : photo} height={height} caption={false} />
          </div>
          <div className={styles.photoTools} role="group" aria-label="Adjust photo">
            <label>Zoom<input type="range" min={100} max={300} step={5} value={photo.zoom ?? 100}
              onChange={(e) => adjust({ zoom: Number(e.target.value) === 100 ? undefined : Number(e.target.value) })} /></label>
            {!cover && <>
              <button type="button" onClick={() => turn(270)} title="Rotate left"><RotateCcw size={14} aria-hidden /> Rotate left</button>
              <button type="button" onClick={() => turn(90)} title="Rotate right"><RotateCw size={14} aria-hidden /> Rotate right</button>
            </>}
            <button type="button" aria-pressed={!!photo.flip} onClick={() => adjust({ flip: photo.flip ? undefined : true })}><FlipHorizontal2 size={14} aria-hidden /> Flip</button>
            <button type="button" onClick={() => adjust({ x: 50, y: 50, zoom: undefined, rotate: undefined, flip: undefined })}><Undo2 size={14} aria-hidden /> Reset</button>
          </div>
          {!cover && <label>Caption
            <input type="text" maxLength={120} value={photo.caption ?? ""} placeholder={photoLabel({ ...photo, caption: undefined })}
              onChange={(e) => adjust({ caption: e.target.value.trim() ? e.target.value : undefined })} />
          </label>}
          <button type="button" onClick={() => setSelected(undefined)}>{secondary ? "Use current photo" : "Use recommended photo"}</button>
          {!fixedCrop && <label>Crop style
            <select value={photo.fit} onChange={(event) => setSelected({ ...photo, fit: event.target.value as ReportPhoto["fit"] })}>
              <option value="cover">Fill frame</option>
              <option value="portrait">Headshot crop</option>
              <option value="whole">Show full photograph</option>
            </select>
          </label>}
          {(fixedCrop || photo.fit !== "whole") && <div className={styles.cropControls}>
            <label>Horizontal crop<input type="range" min={0} max={100} value={photo.x} onChange={(e) => setCrop("x", Number(e.target.value))} /></label>
            <label>Vertical crop<input type="range" min={0} max={100} value={photo.y} onChange={(e) => setCrop("y", Number(e.target.value))} /></label>
          </div>}
        </div>
      </div>
      <button type="submit" disabled={uploading} className={styles.primary}>Apply photo</button>
    </form>
    </dialog>
  );
}
