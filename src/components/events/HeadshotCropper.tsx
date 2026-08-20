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
import { Upload, ZoomIn } from "lucide-react";

const BOX = 240;   // on-screen crop circle
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
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Load the chosen file and frame it so the whole image is visible to
  // begin with — the starting point should never already be a bad crop.
  useEffect(() => {
    if (!file) { setImg(null); return; }
    const url = URL.createObjectURL(file);
    const i = new Image();
    i.onload = () => { setImg(i); setZoom(1); setPos({ x: 0, y: 0 }); };
    i.src = url;
    return () => URL.revokeObjectURL(url);
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

  return (
    <div className="space-y-3">
      <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-slate-300 bg-white px-3 py-3 transition hover:border-brand-400">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400">
          <Upload size={16} />
        </span>
        <span className="text-[13px] text-slate-600">{file ? file.name : "Choose a photo…"}</span>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </label>

      {img && (
        <div className="flex flex-col items-center gap-3 rounded-lg bg-slate-50 p-4">
          <canvas
            ref={canvasRef}
            width={BOX}
            height={BOX}
            className="cursor-move touch-none rounded-full ring-2 ring-white shadow-md"
            onPointerDown={(e) => {
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              drag.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y };
            }}
            onPointerMove={(e) => {
              if (!drag.current) return;
              setPos({
                x: drag.current.px + (e.clientX - drag.current.x),
                y: drag.current.py + (e.clientY - drag.current.y),
              });
            }}
            onPointerUp={(e) => {
              (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
              drag.current = null;
            }}
            onPointerCancel={() => { drag.current = null; }}
          />
          <p className="text-[11.5px] text-slate-500">
            Drag to move · check the top of your head isn’t cut off
          </p>
          <label className="flex w-full max-w-[240px] items-center gap-2">
            <ZoomIn size={14} className="shrink-0 text-slate-400" />
            <input
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="w-full accent-brand-600"
            />
          </label>
        </div>
      )}
    </div>
  );
}
