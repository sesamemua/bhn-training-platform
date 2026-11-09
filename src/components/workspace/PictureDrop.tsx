"use client";

import { useId, useState } from "react";
import { Image as ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
export const MAX_PICTURE_BYTES = 3_000_000;

/**
 * Phone photos are often over the 3 MB upload limit: re-encode them as a
 * JPEG no wider than 2400px. GIFs are left alone (re-encoding drops the
 * animation) and are rejected by the server if too big.
 */
export async function fitPicture(file: File): Promise<File> {
  if (file.size <= MAX_PICTURE_BYTES || file.type === "image/gif") return file;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  for (const quality of [0.9, 0.8, 0.7]) {
    const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, "image/jpeg", quality));
    if (blob && blob.size <= MAX_PICTURE_BYTES) return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  }
  return file;
}

/** Drop a picture here or choose one. Hands back a file already sized to fit. */
export function PictureDrop({ label, busy, hasPicture, onFile, onError }: {
  label: string;
  busy: boolean;
  hasPicture: boolean;
  onFile: (file: File) => void;
  onError: (message: string) => void;
}) {
  const [over, setOver] = useState(false);
  const id = useId();

  async function take(file: File | undefined) {
    if (!file) return;
    if (!TYPES.includes(file.type)) return onError("Use a PNG, JPEG, WebP or GIF picture.");
    const fitted = await fitPicture(file).catch(() => file);
    if (fitted.size > MAX_PICTURE_BYTES) return onError("That picture is over 3 MB. Choose a smaller one.");
    onFile(fitted);
  }

  return (
    <label
      htmlFor={id}
      onDragOver={(e) => { e.preventDefault(); if (!busy) setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); if (!busy) void take(e.dataTransfer.files?.[0]); }}
      className={cn(
        "flex cursor-pointer flex-col items-center gap-1 rounded-[8px] border-2 border-dashed px-4 py-4 text-center text-[13px] transition-colors focus-within:ring-2 focus-within:ring-brand-500",
        over ? "border-brand-500 bg-brand-50 text-brand-800" : "border-line text-muted hover:border-brand-400 hover:bg-brand-50/50",
        busy && "cursor-wait opacity-60",
      )}
    >
      <ImageIcon size={20} className="text-brand-600" aria-hidden />
      <span className="font-semibold text-brand-700">
        {busy ? "Uploading…" : over ? "Drop to upload" : hasPicture ? "Replace graphic" : "Upload graphic"}
      </span>
      <span className="text-[12px]">Drag a picture here or choose a file · PNG, JPEG, WebP or GIF · big photos are shrunk to fit 3 MB</span>
      <input id={id} type="file" aria-label={label} accept={TYPES.join(",")} className="sr-only" disabled={busy}
        onChange={(e) => { void take(e.currentTarget.files?.[0]); e.currentTarget.value = ""; }} />
    </label>
  );
}
