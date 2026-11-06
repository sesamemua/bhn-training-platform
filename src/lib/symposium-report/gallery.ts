import { z } from "zod";

export const REPORT_GALLERY_KEY = "report-photo-catalogue.json";
export const PHOTO_UPLOAD_LIMIT = 3_500_000;
export const reportSectionId = /^[a-z0-9-]{1,64}$/;
export const finalPhotoFile = /^final\.[a-f0-9]{24}\.webp$/;
export const localPhotoFile = /^local\.[a-z0-9-]{1,64}\.[a-f0-9]{24}\.[a-z0-9-]{1,48}\.webp$/;
export const isGalleryPhoto = (file: string) => finalPhotoFile.test(file) || localPhotoFile.test(file);

const entry = z.object({ file: z.string().regex(finalPhotoFile), label: z.string().trim().min(1).max(120) });
const group = z.object({
  id: z.string().regex(reportSectionId), title: z.string().min(1).max(120), photos: z.array(entry).max(450),
});
export const catalogueSchema = z.object({
  groups: z.array(group).max(30),
  defaults: z.record(z.string().regex(reportSectionId), z.array(entry.extend({
    fit: z.enum(["cover", "portrait", "whole"]), x: z.number().int().min(0).max(100), y: z.number().int().min(0).max(100),
  })).max(10)),
});

export type GalleryEntry = { file: string; label: string };
export type GalleryGroup = { id: string; title: string; photos: GalleryEntry[] };

export const chapterGallery: Record<string, string[]> = {
  cover: ["registration", "symposium-photos", "reception"],
  "executive-summary": ["registration", "symposium-photos"],
  "training-week": ["microbix", "ccrm", "communication", "negotiation", "ignited"],
  "annual-symposium": ["keynote", "program-impact", "registration"],
  panels: ["panel-1", "panel-2", "panel-3"],
  venturelift: ["venturelift"],
  discussion: ["discussion", "networking-discussion"],
  "program-impact": ["program-impact"],
  "professional-development": ["communication", "negotiation"],
  "pitch-competition": ["ignited"],
  "follow-through": ["networking", "networking-discussion", "reception"],
};

export function uploadedPhotoLabel(file: string) {
  const name = file.split(".")[3]?.replaceAll("-", " ") || "Local photograph";
  return name[0].toUpperCase() + name.slice(1);
}
