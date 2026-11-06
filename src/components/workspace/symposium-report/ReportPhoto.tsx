"use client";

import { useEffect, useState, type CSSProperties, type FormEvent } from "react";
import type { ReportPhoto } from "@/lib/symposium-report/document";
import { photoLabel, REPORT_ASSETS } from "@/lib/symposium-report/photos";
import { REPORT_API } from "@/lib/symposium-report/document";
import { PHOTO_UPLOAD_LIMIT, type GalleryEntry, type GalleryGroup } from "@/lib/symposium-report/gallery";
import styles from "./report.module.css";

export function PhotoFigure({ photo, height, lead = false }: { photo: ReportPhoto; height: number; lead?: boolean }) {
  const source = `${REPORT_ASSETS}/${photo.file}`;
  const label = photoLabel(photo);
  const style = {
    aspectRatio: `684 / ${height}`,
    "--photo-background": `url("${source}")`,
    "--photo-focus": `${photo.x}% ${photo.y}%`,
  } as CSSProperties;
  return (
    <figure className={lead ? styles.photo : styles.fillPhoto} data-report-photo={photo.file}>
      <div className={styles.photoMat} style={style} data-fit={photo.fit}>
        {/* eslint-disable-next-line @next/next/no-img-element -- same authenticated artwork for preview and print */}
        <img src={source} alt={label} />
      </div>
      <figcaption>{label}</figcaption>
    </figure>
  );
}

export function CoverArt({ photo }: { photo: ReportPhoto }) {
  return (
    <div className={styles.coverArt} aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element -- original artwork for the print cover */}
      <img className={styles.coverCrystal} src={`${REPORT_ASSETS}/recap-optical-passage.webp`} alt="" />
      {/* eslint-disable-next-line @next/next/no-img-element -- original event photo for the print cover */}
      <img className={styles.coverEvent} src={`${REPORT_ASSETS}/${photo.file}`} alt="" style={{ objectPosition: `${photo.x}% ${photo.y}%` }} />
    </div>
  );
}

function galleryChoice({ file, label }: GalleryEntry): ReportPhoto {
  return { file, caption: label, x: 50, y: 28, fit: "whole" };
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

export function PhotoEditor({ initial, automatic, height, section, cover, portrait, onApply, onCancel }: {
  initial?: ReportPhoto;
  automatic: ReportPhoto;
  height: number;
  section: string;
  cover: boolean;
  portrait: boolean;
  onApply: (photo: ReportPhoto | undefined) => void;
  onCancel: () => void;
}) {
  const [selected, setSelected] = useState(initial);
  const [groups, setGroups] = useState<GalleryGroup[] | null>(null);
  const [groupId, setGroupId] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const group = groups?.find((item) => item.id === groupId) ?? groups?.[0];
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

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!uploading) onApply(selected && portrait ? { ...selected, fit: "cover" } : selected);
  }

  return (
    <form className={`${styles.editForm} report-screen-only`} onSubmit={submit} onKeyDown={(e) => { if (e.key === "Escape") onCancel(); }}>
      <div className={styles.editHeader}>
        <div><p>{cover ? "Cover photograph" : portrait ? "Panel portrait" : "Page photograph"}</p><h2>Swap or crop photo</h2></div>
        <button type="button" onClick={onCancel}>Cancel</button>
      </div>
      <div className={styles.photoWorkbench}>
        <div className={styles.photoChoices}>
          {groups === null ? <p role="status">Loading final event photos…</p> : group ? <>
            <label>Session photos
              <select aria-label="Session photos" data-report-photo-picker="" value={group.id} onChange={(event) => setGroupId(event.target.value)}>
                {groups.map(({ id, title, photos }) => <option key={id} value={id}>{title} · {photos.length}</option>)}
              </select>
            </label>
            <div className={styles.photoThumbnails} aria-label={group.title}>
              {group.photos.map((item) => <button type="button" key={item.file} aria-pressed={photo.file === item.file}
                onClick={() => setSelected(galleryChoice(item))}>
                {/* eslint-disable-next-line @next/next/no-img-element -- private gallery asset */}
                <img src={`${REPORT_ASSETS}/${item.file}`} alt="" loading="lazy" />
                <span>{item.label}</span>
              </button>)}
            </div>
          </> : <p>No final session photos are available yet.</p>}
          <label>Choose a photo from this device
            <input aria-label="Choose a photo from this device" data-report-photo-picker={!group ? "" : undefined} type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading}
              onChange={(event) => { void upload(event.target.files?.[0]); event.target.value = ""; }} />
          </label>
          {uploading && <p role="status">Adding the photo to this section…</p>}
          {error && <p role="alert" className={styles.error}>{error}</p>}
        </div>
        <div className={styles.photoPreview}>
          <PhotoFigure photo={fixedCrop ? { ...photo, fit: "cover" } : photo} height={height} />
          <button type="button" onClick={() => setSelected(undefined)}>{portrait ? "Use current photo" : "Use recommended photo"}</button>
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
  );
}
