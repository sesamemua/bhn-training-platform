import { z } from "zod";
import { reportPhotos, type ReportPhotoFile } from "./photos";

export const REPORT_ID = "symposium-2026-event-report";
export const REPORT_PATH = "/admin/workspace/symposium-2026/report";
export const REPORT_API = "/api/workspace/symposium-2026/report";
export const REPORT_TITLE = "2026 Symposium & Training Week Report";

export const reportImages = ["registration", "microbix", "keynote", "venture", "roundtable", "network"] as const;

export const reportAssetTypes: Readonly<Record<string, string>> = {
  "recap-optical-passage.webp": "image/webp",
  "biohubnet-logo-white.png": "image/png",
  ...Object.fromEntries(Object.keys(reportPhotos).map((file) => [file, file.endsWith(".webp") ? "image/webp" : "image/jpeg"])),
};

const reportPhoto = z.object({
  file: z.custom<ReportPhotoFile>((file) => typeof file === "string" && Object.hasOwn(reportPhotos, file), "Choose a report photograph"),
  x: z.number().int().min(0).max(100),
  y: z.number().int().min(0).max(100),
  fit: z.enum(["cover", "portrait", "whole"]),
});
export type ReportPhoto = z.infer<typeof reportPhoto>;

const registrationChart = z.object({
  unit: z.string().trim().min(1).max(36),
  source: z.string().trim().min(1).max(210),
  categories: z.array(z.object({
    label: z.string().trim().min(1).max(72),
    count: z.number().int().min(0).max(100_000),
  })).length(4).refine((items) => items.some((item) => item.count > 0), "The registration chart needs at least one positive count"),
});
export type Registration = z.infer<typeof registrationChart>;

const page = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,64}$/).refine((id) => id !== "cover" && id !== "back"),
  label: z.string().trim().min(1).max(42),
  title: z.string().trim().min(1).max(100),
  text: z.string().max(16_000),
  image: z.enum(reportImages).optional(),
  registration: registrationChart.optional(),
  photos: z.record(z.string().regex(/^(0|[1-9]\d?)$/), reportPhoto).optional(),
  frames: z.number().int().min(1).max(20),
});
export const reportSchema = z.object({
  cover: z.object({ title: z.string().trim().min(1).max(86), theme: z.string().trim().min(1).max(120), date: z.string().trim().min(1).max(70), photo: reportPhoto.optional() }),
  pages: z.array(page).min(1).max(40).refine((pages) => new Set(pages.map((p) => p.id)).size === pages.length, "Duplicate page ID"),
  back: z.object({ title: z.string().trim().min(1).max(100), text: z.string().trim().min(1).max(260) }),
}).refine((report) => report.pages.reduce((sum, p) => sum + p.text.length, 0) <= 80_000, "The report is too large");

export type Report = z.infer<typeof reportSchema>;
export type ReportPage = z.infer<typeof page>;
