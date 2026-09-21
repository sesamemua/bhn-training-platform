/**
 * Save text as a file from the browser (a CSV, a list). Client-only.
 * CSV gets a byte-order mark so Excel reads accented names correctly.
 */
export function downloadText(filename: string, text: string, type = "text/csv") {
  const body = type === "text/csv" ? `﻿${text}` : text;
  const url = URL.createObjectURL(new Blob([body], { type: `${type};charset=utf-8` }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Today's date for a file name, e.g. 2026-09-21. */
export const fileDate = () => new Date().toLocaleDateString("en-CA");
