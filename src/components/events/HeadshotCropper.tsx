"use client";

/**
 * Circular headshot picker.
 *
 * A plain file input plus a round preview is not enough: a portrait
 * cropped to a circle by CSS alone routinely cuts the top of someone's
 * head off, and the person submitting cannot see it happen. So the crop
 * is explicit — drag to move, slider to zoom, and what is inside the ring
 * is exactly what gets uploaded, rendered to a square canvas on submit.
 *
 * Scale with the slider, the scroll wheel or a trackpad/finger pinch
 * (toward the pointer). "Auto center" frames the photo on where the eye
 * goes — the person, or what stands out — rather than the middle of the
 * pixels (see lib/images/focal-point); it also runs when a photo loads.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Crosshair, RefreshCw, Trash2, Upload, ZoomIn } from "lucide-react";
import { focalPoint, offsetFor, type Focus } from "@/lib/images/focal-point";

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
const MIN_ZOOM = 1, MAX_ZOOM = 4;
const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

/** Where the eye goes in this image, from a small copy of it. */
function focusOf(img: HTMLImageElement): Focus {
  const k = Math.min(1, 160 / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(img.width * k));
  c.height = Math.max(1, Math.round(img.height * k));
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return { x: 0.5, y: 0.5, person: false };
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return focalPoint(ctx.getImageData(0, 0, c.width, c.height));
}

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
  const focus = useRef<Focus | null>(null);
  // Fingers on the canvas, for a two-finger pinch.
  const touches = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; z: number } | null>(null);

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
      // Framed on where the eye goes from the start.
      focus.current = focusOf(i);
      const b = Math.max(BOX / i.width, BOX / i.height);
      setPos(offsetFor(focus.current, { w: i.width * b, h: i.height * b }, BOX));
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

  /** Centre the photo on its focal point at the current zoom. */
  const autoCenter = useCallback(() => {
    if (!img) return;
    focus.current ??= focusOf(img);
    const s = baseScale * zoom;
    setPos(offsetFor(focus.current, { w: img.width * s, h: img.height * s }, BOX));
  }, [img, baseScale, zoom]);

  /** Zoom to `next`, keeping the point under (cx, cy) — buffer px from the circle's centre — where it is. */
  const zoomRef = useRef(zoom);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  const zoomAt = useCallback((next: number, cx: number, cy: number) => {
    const nz = clampZoom(next);
    const r = nz / zoomRef.current;
    zoomRef.current = nz;
    setZoom(nz);
    setPos((p) => ({ x: cx - (cx - p.x) * r, y: cy - (cy - p.y) * r }));
  }, []);

  // Wheel and trackpad pinch (which arrives as a ctrl+wheel). Not passive,
  // so the page does not scroll while the photo zooms.
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = c.getBoundingClientRect();
      const k = r.width > 0 ? BOX / r.width : 1;
      const cx = (e.clientX - r.left) * k - BOX / 2, cy = (e.clientY - r.top) * k - BOX / 2;
      zoomAt(zoomRef.current * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), cx, cy);
    };
    c.addEventListener("wheel", onWheel, { passive: false });
    return () => c.removeEventListener("wheel", onWheel);
  }, [img, zoomAt]);

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
    focus.current = null;
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
              touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
              if (touches.current.size === 2) {
                const [a, b] = [...touches.current.values()];
                pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), z: zoom };
                drag.current = null;
                return;
              }
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
              if (touches.current.has(e.pointerId)) touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
              if (pinch.current && touches.current.size === 2) {
                const [a, b] = [...touches.current.values()];
                const r = e.currentTarget.getBoundingClientRect();
                const k = r.width > 0 ? BOX / r.width : 1;
                const cx = ((a.x + b.x) / 2 - r.left) * k - BOX / 2, cy = ((a.y + b.y) / 2 - r.top) * k - BOX / 2;
                zoomAt(pinch.current.z * (Math.hypot(a.x - b.x, a.y - b.y) / (pinch.current.d || 1)), cx, cy);
                return;
              }
              if (!drag.current) return;
              const { k } = drag.current;
              setPos({
                x: drag.current.px + (e.clientX - drag.current.x) * k,
                y: drag.current.py + (e.clientY - drag.current.y) * k,
              });
            }}
            onPointerUp={(e) => {
              (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
              touches.current.delete(e.pointerId);
              if (touches.current.size < 2) pinch.current = null;
              drag.current = null;
            }}
            onPointerCancel={(e) => { touches.current.delete(e.pointerId); pinch.current = null; drag.current = null; }}
          />
          <p className="text-[11.5px] text-[var(--speaker-subtle)]">
            Drag to move · scroll or pinch to zoom · check the top of your head isn’t cut off
          </p>
          <div className="flex w-full max-w-[340px] items-center gap-2">
            <label className="flex min-w-0 flex-1 items-center gap-2">
              <ZoomIn size={14} className="shrink-0 text-[var(--speaker-subtle)]" />
              <span className="sr-only">Zoom</span>
              <input
                type="range"
                min={MIN_ZOOM}
                max={MAX_ZOOM}
                step={0.01}
                value={zoom}
                onChange={(e) => zoomAt(Number(e.target.value), 0, 0)}
                className="w-full accent-[var(--brand-600)]"
              />
            </label>
            <button
              type="button"
              onClick={autoCenter}
              title="Centre the photo on you — where the eye goes, not the middle of the picture"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[var(--speaker-control-line)] bg-[var(--speaker-control-bg)] px-2.5 py-1.5 text-[12px] font-semibold text-[var(--speaker-control-ink)] hover:border-[var(--brand-400)]"
            >
              <Crosshair size={13} /> Auto center
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
