"use client";

import { useState, type CSSProperties, type FormEvent } from "react";
import type { ReportPhoto } from "@/lib/symposium-report/document";
import { photoPreset, REPORT_ASSETS, reportPhotos, type ReportPhotoFile } from "@/lib/symposium-report/photos";
import styles from "./report.module.css";

export function PhotoFigure({ photo, height, lead = false }: { photo: ReportPhoto; height: number; lead?: boolean }) {
  const source = `${REPORT_ASSETS}/${photo.file}`;
  const label = reportPhotos[photo.file].label;
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

export function PhotoEditor({ initial, automatic, height, cover, onApply, onCancel }: {
  initial?: ReportPhoto;
  automatic: ReportPhoto;
  height: number;
  cover: boolean;
  onApply: (photo: ReportPhoto | undefined) => void;
  onCancel: () => void;
}) {
  const [selected, setSelected] = useState(initial);
  const photo = selected ?? automatic;
  const setCrop = (axis: "x" | "y", value: number) => setSelected({ ...photo, [axis]: value });

  function submit(event: FormEvent) {
    event.preventDefault();
    onApply(selected);
  }

  return (
    <form className={`${styles.editForm} report-screen-only`} onSubmit={submit} onKeyDown={(e) => { if (e.key === "Escape") onCancel(); }}>
      <div className={styles.editHeader}>
        <div><p>{cover ? "Cover photograph" : "Page photograph"}</p><h2>Swap or crop photo</h2></div>
        <button type="button" onClick={onCancel}>Cancel</button>
      </div>
      <label>Photograph
        <select data-report-photo-picker="" value={selected?.file ?? ""} onChange={(event) => {
          const file = event.target.value as ReportPhotoFile | "";
          setSelected(file ? photoPreset(file) : undefined);
        }}>
          <option value="">Automatic · {reportPhotos[automatic.file].label}</option>
          {(Object.keys(reportPhotos) as ReportPhotoFile[]).map((file) => <option key={file} value={file}>{reportPhotos[file].label}</option>)}
        </select>
      </label>
      <div className={styles.photoPreview}><PhotoFigure photo={cover ? { ...photo, fit: "cover" } : photo} height={height} /></div>
      {!cover && <label>Crop style
        <select value={photo.fit} onChange={(event) => setSelected({ ...photo, fit: event.target.value as ReportPhoto["fit"] })}>
          <option value="cover">Fill frame</option>
          <option value="portrait">Headshot crop</option>
          <option value="whole">Show full photograph</option>
        </select>
      </label>}
      {(cover || photo.fit !== "whole") && (
        <div className={styles.cropControls}>
          <label>Horizontal crop<input type="range" min={0} max={100} value={photo.x} onChange={(e) => setCrop("x", Number(e.target.value))} /></label>
          <label>Vertical crop<input type="range" min={0} max={100} value={photo.y} onChange={(e) => setCrop("y", Number(e.target.value))} /></label>
        </div>
      )}
      <p>Keep faces inside the preview. Use the full photograph for groups.</p>
      <button type="submit" className={styles.primary}>Apply photo</button>
    </form>
  );
}
