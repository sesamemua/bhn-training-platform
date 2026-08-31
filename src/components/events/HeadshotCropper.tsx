"use client";

/**
 * Circular headshot picker.
 *
 * A plain file input plus a round preview is not enough: a portrait
 * cropped to a circle by CSS alone routinely cuts the top of someone's
 * head off, and the person submitting cannot see it happen. So the crop
 * is explicit — drag to move, slider to zoom, and what is inside the ring
 * is exactly what gets uploaded, rendered to a square canvas on submit.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw, Trash2, Upload, ZoomIn } from "lucide-react";

/*
 * The on-screen crop circle. 340, not the 240 it was: this is the one
 * control on the form where a speaker is judging their own face, and at
 * 240 you cannot see whether the crop is right until it is on the
 * website.
 *
 * It is also the canvas's drawing buffer. The element is allowed to
 * shrink below this on a narrow phone (w-full max-w), so the drag
 * handler scales pointer movement by the ratio between the two — a
 * canvas displayed smaller than its buffer moves further per pixel of
 * finger travel, and without the scale the image slides out from under
 * the touch.
 */
const BOX = 340;   // on-screen crop circle
const OUT = 600;   // uploaded square, big enough for print-ish use

export interface CropState {
  file: File | null;
  /** Renders the current crop to a square PNG for upload. */
  toBlob: () => Promise<Blob | null>;
}

export function HeadshotCropper({ onChange }: { onChange: (s: CropState) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; px: number; py: number; k: number } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load the chosen file and frame it so the whole image is visible to
  // begin with — the starting point should never already be a bad crop.
  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const i = new Image();
    let active = true;
    i.onload = () => {
      if (!active) return;
      setImg(i);
      setZoom(1);
      setPos({ x: 0, y: 0 });
    };
    i.src = url;
    return () => {
      active = false;
      URL.revokeObjectURL(url);
    };
  }, [file]);

  /** Scale at zoom=1: the image just covers the circle. */
  const baseScale = img ? Math.max(BOX / img.width, BOX / img.height) : 1;

  const draw = useCallback(() => {
    const c = canvasRef.current;
    if (!c || !img) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, BOX, BOX);
    ctx.save();
    ctx.beginPath();
    ctx.arc(BOX / 2, BOX / 2, BOX / 2, 0, Math.PI * 2);
    ctx.clip();
    const s = baseScale * zoom;
    const w = img.width * s;
    const h = img.height * s;
    ctx.drawImage(img, BOX / 2 - w / 2 + pos.x, BOX / 2 - h / 2 + pos.y, w, h);
    ctx.restore();
  }, [img, zoom, pos, baseScale]);

  useEffect(() => { draw(); }, [draw]);

  const toBlob = useCallback(async (): Promise<Blob | null> => {
    if (!img) return null;
    // Re-render at output size using the same geometry, so the upload
    // matches the ring the speaker approved.
    const c = document.createElement("canvas");
    c.width = OUT; c.height = OUT;
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, OUT, OUT);
    const k = OUT / BOX;
    const s = baseScale * zoom * k;
    const w = img.width * s;
    const h = img.height * s;
    ctx.drawImage(img, OUT / 2 - w / 2 + pos.x * k, OUT / 2 - h / 2 + pos.y * k, w, h);
    return new Promise((res) => c.toBlob((b) => res(b), "image/png"));
  }, [img, zoom, pos, baseScale]);

  useEffect(() => { onChange({ file, toBlob }); }, [file, toBlob, onChange]);

  const removePhoto = useCallback(() => {
    setFile(null);
    setImg(null);
    setZoom(1);
    setPos({ x: 0, y: 0 });
    drag.current = null;
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-lg border border-dashed border-[var(--speaker-control-line)] bg-[var(--speaker-control-bg)] px-3 py-3 transition hover:border-[var(--brand-400)]">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--speaker-disabled-bg)] text-[var(--speaker-subtle)]">
            {file ? <RefreshCw size={16} /> : <Upload size={16} />}
          </span>
          <span className="min-w-0 flex-1 text-[13px] text-[var(--speaker-copy)]">
            <span className="block font-semibold">{file ? "Replace photo" : "Choose a photo…"}</span>
            {file && <span className="mt-0.5 block truncate text-[11.5px] text-[var(--speaker-subtle)]">{file.name}</span>}
          </span>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onClick={(e) => { e.currentTarget.value = ""; }}
            onChange={(e) => {
              const nextFile = e.target.files?.[0];
              if (!nextFile) return;
              setImg(null);
              setFile(nextFile);
            }}
          />
        </label>

        {file && (
          <button
            type="button"
            onClick={removePhoto}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--speaker-danger-line)] bg-[var(--speaker-danger-bg)] px-3 py-2 text-[12.5px] font-semibold text-[var(--speaker-danger-strong)] transition hover:border-[var(--speaker-danger)]"
          >
            <Trash2 size={15} />
            Remove photo
          </button>
        )}
      </div>

      {img && (
        <div className="flex flex-col items-center gap-3 rounded-lg bg-[var(--speaker-control-bg)] p-4">
          <canvas
            ref={canvasRef}
            width={BOX}
            height={BOX}
            className="h-auto w-full max-w-[340px] cursor-move touch-none rounded-full ring-2 ring-white shadow-md"
            onPointerDown={(e) => {
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              const r = e.currentTarget.getBoundingClientRect();
              drag.current = {
                x: e.clientX,
                y: e.clientY,
                px: pos.x,
                py: pos.y,
                // Buffer pixels per CSS pixel. 1 on a wide screen, more
                // once the circle has been shrunk to fit a phone.
                k: r.width > 0 ? BOX / r.width : 1,
              };
            }}
            onPointerMove={(e) => {
              if (!drag.current) return;
              const { k } = drag.current;
              setPos({
                x: drag.current.px + (e.clientX - drag.current.x) * k,
                y: drag.current.py + (e.clientY - drag.current.y) * k,
              });
            }}
            onPointerUp={(e) => {
              (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
              drag.current = null;
            }}
            onPointerCancel={() => { drag.current = null; }}
          />
          <p className="text-[11.5px] text-[var(--speaker-subtle)]">
            Drag to move · check the top of your head isn’t cut off
          </p>
          <label className="flex w-full max-w-[340px] items-center gap-2">
            <ZoomIn size={14} className="shrink-0 text-[var(--speaker-subtle)]" />
            <input
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="w-full accent-[var(--brand-600)]"
            />
          </label>
        </div>
      )}
    </div>
  );
}
