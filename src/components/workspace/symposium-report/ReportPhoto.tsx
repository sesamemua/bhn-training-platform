"use client";

import { useEffect, useId, useRef, useState, type CSSProperties, type FormEvent, type PointerEvent } from "react";
import { FlipHorizontal2, RotateCcw, RotateCw, Trash2, Undo2 } from "lucide-react";
import type { ReportPhoto } from "@/lib/symposium-report/document";
import { photoAdjust, photoCaption, photoLabel, REPORT_ASSETS } from "@/lib/symposium-report/photos";
import { REPORT_API } from "@/lib/symposium-report/document";
import { PHOTO_UPLOAD_LIMIT, type GalleryEntry, type GalleryGroup } from "@/lib/symposium-report/gallery";
import { headCropRisk, headSafeCrop, primaryHead, clamp, type HeadRegion, type ImageSize } from "@/lib/images/head-crop";
import { detectHeads } from "@/lib/images/detect-heads";
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
  const mat = useRef<HTMLDivElement>(null);
  const [clipped, setClipped] = useState(false);
  const [size, setSize] = useState<ImageSize | null>(null);
  useEffect(() => {
    const node = mat.current;
    if (!node || !photo.subject || !size) return;
    const update = () => setClipped(headCropRisk(photo.subject!, size, { width: node.clientWidth, height: node.clientHeight }, photo).clipped);
    const observer = new ResizeObserver(update); observer.observe(node); update();
    return () => observer.disconnect();
  }, [photo, size]);
  const style = {
    aspectRatio: `684 / ${height}`,
    "--photo-background": `url("${source}")`,
    "--photo-focus": `${photo.x}% ${photo.y}%`,
  } as CSSProperties;
  return (
    <figure className={lead ? styles.photo : styles.fillPhoto} data-report-photo={photo.file} data-photo-slot={slot} data-head-clipped={photo.subject && clipped || undefined}>
      <div ref={mat} className={styles.photoMat} style={style} data-fit={photo.fit} data-turned={photoAdjust(photo).turned || undefined}>
        {/* eslint-disable-next-line @next/next/no-img-element -- same authenticated artwork for preview and print */}
        <img src={source} alt={label} style={adjustStyle(photo)} onLoad={event => { const img = event.currentTarget; setSize({ width: img.naturalWidth, height: img.naturalHeight }); }} />
        {photo.subject && clipped && <span className={`${styles.headWarning} report-screen-only`}>Main head is cropped · adjust photo</span>}
      </div>
      {caption && <figcaption>{photoCaption(photo)}</figcaption>}
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
  const original = useRef<HTMLImageElement>(null);
  const [heads, setHeads] = useState<HeadRegion[]>([]);
  const [checking, setChecking] = useState(false);
  const [detectionNote, setDetectionNote] = useState("");
  const [imageSize, setImageSize] = useState<ImageSize | null>(null);
  const [manual, setManual] = useState(false);
  const regionDrag = useRef<{ x: number; y: number } | null>(null);
  const frameSize = { width: 684, height };
  const risk = photo.subject && imageSize ? headCropRisk(photo.subject, imageSize, frameSize, fixedCrop ? { ...photo, fit: "cover" } : photo) : null;
  const safe = photo.subject && imageSize && risk?.clipped ? headSafeCrop(photo.subject, imageSize, frameSize, fixedCrop ? { ...photo, fit: "cover" } : photo) : null;
  async function analyze() {
    const image = original.current;
    if (!image?.complete || !image.naturalWidth) return;
    const file = photo.file;
    setImageSize({ width: image.naturalWidth, height: image.naturalHeight });
    setChecking(true); setDetectionNote(""); setHeads([]);
    try {
      const candidates = await detectHeads(image);
      if (original.current !== image || image.getAttribute("src") !== `${REPORT_ASSETS}/${file}`) return;
      setHeads(candidates);
      const suggested = primaryHead(candidates);
      setDetectionNote(candidates.length ? `${candidates.length} head candidate${candidates.length === 1 ? "" : "s"}. Only the selected main subject is checked.` : "No clear face detected. You can mark the main head manually, including a face on a screen.");
      if (suggested) setSelected(current => { const value = current ?? automatic; return value.file === file && !value.subject ? { ...value, subject: suggested } : current; });
    } catch { setDetectionNote("Automatic detection is unavailable. Mark the main head manually to check this crop."); }
    finally { setChecking(false); }
  }
  function markPoint(event: PointerEvent<HTMLDivElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    return { x: clamp((event.clientX - box.left) / box.width), y: clamp((event.clientY - box.top) / box.height) };
  }

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
    const chosen = selected && { ...selected, caption: selected.caption?.trim(), hidden: undefined };
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
          <p className={styles.photoPreviewLabel}>Full source · choose the main subject</p>
          <div className={styles.sourcePreview} data-mark-head={manual || undefined}
            onPointerDown={event => { if (!manual) return; regionDrag.current = markPoint(event); event.currentTarget.setPointerCapture(event.pointerId); }}
            onPointerUp={event => { const from = regionDrag.current; regionDrag.current = null; if (!manual || !from) return; const to = markPoint(event); const width = Math.abs(to.x - from.x), headHeight = Math.abs(to.y - from.y); if (width > .01 && headHeight > .01) adjust({ subject: { x: Math.min(from.x, to.x), y: Math.min(from.y, to.y), width, height: headHeight, source: "manual" } }); setManual(false); }} onPointerCancel={() => { regionDrag.current = null; }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- same-origin source analyzed entirely in the browser */}
            <img ref={original} src={`${REPORT_ASSETS}/${photo.file}`} alt="Full uncropped source" onLoad={() => void analyze()} draggable={false} />
            {photo.subject && <span className={styles.protectedHead} style={{ left: `${photo.subject.x * 100}%`, top: `${photo.subject.y * 100}%`, width: `${photo.subject.width * 100}%`, height: `${photo.subject.height * 100}%` }} />}
          </div>
          <div className={styles.subjectTools}>
            {heads.length > 0 && <label>Main subject<select aria-label="Main subject" value={heads.findIndex(h => h === photo.subject || JSON.stringify(h) === JSON.stringify(photo.subject))} onChange={event => { const head = heads[Number(event.target.value)]; if (head) adjust({ subject: head }); }}><option value={-1}>Manual or saved selection</option>{heads.map((_, i) => <option key={i} value={i}>Head {i + 1}</option>)}</select></label>}
            <button type="button" aria-pressed={manual} onClick={() => { setManual(!manual); if (!photo.subject) adjust({ subject: { x: .35, y: .15, width: .3, height: .3, source: "manual" } }); }}>Mark main head</button>
            <button type="button" disabled={checking} onClick={() => void analyze()}>Check heads again</button>
            {photo.subject && <button type="button" onClick={() => adjust({ subject: undefined })}>Clear head protection</button>}
          </div>
          {manual && <p>Drag a box around the main person’s full head, including hair. Side and bottom bystanders are not checked. Alternatively choose a detected head above.</p>}
          {manual && photo.subject && <fieldset className={styles.subjectCoordinates}><legend>Protected head box · source image percent</legend>{(["x", "y", "width", "height"] as const).map(key => <label key={key}>{({ x: "Left", y: "Top", width: "Width", height: "Height" })[key]}<input type="number" min={key === "width" || key === "height" ? 1 : 0} max={100} step={.1} value={Math.round(photo.subject![key] * 1000) / 10} onChange={event => {
            const head = { ...photo.subject!, source: "manual" as const };
            const maximum = key === "x" ? 1 - head.width : key === "y" ? 1 - head.height : key === "width" ? 1 - head.x : 1 - head.y;
            head[key] = clamp(Number(event.target.value) / 100, key === "width" || key === "height" ? .01 : 0, maximum); adjust({ subject: head });
          }} /></label>)}</fieldset>}
          <p role="status" className={styles.detectionNote}>{checking ? "Checking source faces locally…" : detectionNote}</p>
          <p className={styles.photoPreviewLabel}>Actual report frame · {Math.round(684 / height * 100) / 100}:1</p>
          <div className={styles.photoDrag} style={{ "--photo-preview-ratio": 684 / height } as CSSProperties} onPointerDown={startDrag} onPointerMove={moveDrag}
            onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} title="Drag to move the crop">
            <PhotoFigure photo={fixedCrop ? { ...photo, fit: "cover" } : photo} height={height} caption={false} />
          </div>
          {risk && <div role="status" className={risk.clipped ? styles.cropRisk : styles.cropSafe}>
            {risk.clipped ? "The selected main head is cut off in the report frame." : "The selected main head fits inside the report frame."}
            {safe && <button type="button" onClick={() => adjust(safe)}>Protect head · adjust crop</button>}
            {risk.clipped && !safe && <p>Use Show full photograph, a taller frame or a different photo.</p>}
          </div>}
          <div className={styles.photoTools} role="group" aria-label="Adjust photo">
            <label>Zoom · {photo.zoom ?? 100}%<input type="range" min={50} max={300} step={1} value={photo.zoom ?? 100}
              onChange={(e) => adjust({ zoom: Number(e.target.value) === 100 ? undefined : Number(e.target.value) })} /></label>
            {!cover && <>
              <button type="button" onClick={() => turn(270)} title="Rotate left"><RotateCcw size={14} aria-hidden /> Rotate left</button>
              <button type="button" onClick={() => turn(90)} title="Rotate right"><RotateCw size={14} aria-hidden /> Rotate right</button>
            </>}
            <button type="button" aria-pressed={!!photo.flip} onClick={() => adjust({ flip: photo.flip ? undefined : true })}><FlipHorizontal2 size={14} aria-hidden /> Flip</button>
            <button type="button" onClick={() => adjust({ x: 50, y: 50, zoom: undefined, rotate: undefined, flip: undefined })}><Undo2 size={14} aria-hidden /> Reset</button>
          </div>
          {!cover && <label>Caption
            <input type="text" maxLength={120} value={photo.caption ?? ""} placeholder="Optional caption"
              onChange={(e) => adjust({ caption: e.target.value })} />
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
            <label>Horizontal crop · {photo.x}%<input type="range" min={0} max={100} value={photo.x} onChange={(e) => setCrop("x", Number(e.target.value))} /><input type="number" aria-label="Horizontal crop percent" min={0} max={100} value={photo.x} onChange={e => setCrop("x", Math.round(clamp(Number(e.target.value), 0, 100)))} /></label>
            <label>Vertical crop · {photo.y}%<input type="range" min={0} max={100} value={photo.y} onChange={(e) => setCrop("y", Number(e.target.value))} /><input type="number" aria-label="Vertical crop percent" min={0} max={100} value={photo.y} onChange={e => setCrop("y", Math.round(clamp(Number(e.target.value), 0, 100)))} /></label>
          </div>}
        </div>
      </div>
      <button type="submit" disabled={uploading} className={styles.primary}>Apply photo</button>
    </form>
    </dialog>
  );
}
