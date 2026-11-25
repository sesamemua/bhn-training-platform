import { z } from "zod";
import { reportPhotos } from "./photos";
import { isGalleryPhoto } from "./gallery";

export const REPORT_ID = "symposium-2026-event-report";
export const REPORT_PATH = "/admin/workspace/symposium-2026/report";
export const REPORT_REVIEW_PATH = "/review/symposium-2026/report";
export const REPORT_API = "/api/workspace/symposium-2026/report";
export const REPORT_TITLE = "2026 Symposium & Training Week Report";

export const reportImages = ["registration", "microbix", "keynote", "venture", "roundtable", "network"] as const;

export const reportAssetTypes: Readonly<Record<string, string>> = {
  "recap-optical-passage.webp": "image/webp",
  "biohubnet-logo-white.png": "image/png",
  ...Object.fromEntries(Object.keys(reportPhotos).map((file) => [file, file.endsWith(".webp") ? "image/webp" : "image/jpeg"])),
};

const reportPhoto = z.object({
  file: z.string().refine((file) => Object.hasOwn(reportPhotos, file) || isGalleryPhoto(file), "Choose a report photograph"),
  // Empty is intentional: deleting a caption must survive saving and reloading.
  caption: z.string().trim().max(120).optional(),
  x: z.number().int().min(0).max(100),
  y: z.number().int().min(0).max(100),
  fit: z.enum(["cover", "portrait", "whole"]),
  // Optional, so copies saved before these existed still load.
  zoom: z.number().int().min(50).max(300).optional(),
  rotate: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]).optional(),
  flip: z.boolean().optional(),
  subject: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1), width: z.number().positive().max(1), height: z.number().positive().max(1), source: z.enum(["detected", "manual"]).optional() })
    .refine(r => r.x + r.width <= 1.001 && r.y + r.height <= 1.001, "Keep the protected head within the source photo").optional(),
  /** Removed from the page (the main photo slot would otherwise fall back to a recommended one). */
  hidden: z.literal(true).optional(),
});
export type ReportPhoto = z.infer<typeof reportPhoto>;

const registrationChart = z.object({
  unit: z.string().trim().min(1).max(36),
  source: z.string().trim().min(1).max(210),
  categories: z.array(z.object({
    label: z.string().trim().min(1).max(72),
    count: z.number().int().min(0).max(100_000),
  })).min(1).max(8).refine((items) => items.some((item) => item.count > 0), "The registration chart needs at least one positive count"),
  audience: z.object({
    trainees: z.number().int().min(0).max(100_000),
    professionals: z.number().int().min(0).max(100_000),
  }).refine((value) => value.trainees + value.professionals > 0).optional(),
  percentagesOnly: z.boolean().optional(),
});
export type Registration = z.infer<typeof registrationChart>;

const page = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,64}$/).refine((id) => id !== "cover" && id !== "back"),
  label: z.string().trim().min(1).max(42),
  title: z.string().trim().min(1).max(100),
  text: z.string().max(16_000),
  intro: z.string().max(1200).optional(),
  image: z.enum(reportImages).optional(),
  registration: registrationChart.optional(),
  showCaptions: z.boolean().optional(),
  fillPhotos: z.boolean().optional(),
  photos: z.record(z.string().regex(/^(0|[1-9]\d?|portrait-[1-5]|photo-(?:0|[1-9]\d?)-[1-5]|workshop-[1-9]\d?-[1-6])$/), reportPhoto).optional(),
  frames: z.number().int().min(1).max(20),
});
export const reportSchema = z.object({
  cover: z.object({ title: z.string().trim().min(1).max(86), theme: z.string().trim().min(1).max(120), date: z.string().trim().min(1).max(70), photo: reportPhoto.optional() }),
  pages: z.array(page).min(1).max(40).refine((pages) => new Set(pages.map((p) => p.id)).size === pages.length, "Duplicate page ID"),
  back: z.object({ title: z.string().trim().min(1).max(100), text: z.string().trim().min(1).max(260) }),
}).refine((report) => report.pages.reduce((sum, p) => sum + p.text.length, 0) <= 80_000, "The report is too large");

export type Report = z.infer<typeof reportSchema>;
export type ReportPage = z.infer<typeof page>;
