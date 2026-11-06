import type { ReportPage, ReportPhoto } from "./document";

type PhotoPreset = { label: string; x: number; y: number; fit: "cover" | "portrait" | "whole" };

export const reportPhotos = {
  "cover.jpg": { label: "Symposium audience", x: 50, y: 50, fit: "cover" },
  "microbix.jpg": { label: "Inside the Microbix facility", x: 50, y: 26, fit: "cover" },
  "keynote.jpg": { label: "Christopher Procyshyn · keynote", x: 53, y: 19, fit: "portrait" },
  "venture.jpg": { label: "EQUIP VentureLift presentation", x: 62, y: 24, fit: "portrait" },
  "roundtable.jpg": { label: "Symposium table discussion", x: 50, y: 25, fit: "cover" },
  "network.jpg": { label: "Networking across the symposium hall", x: 50, y: 31, fit: "cover" },
  "welcome-1.webp": { label: "Opening remarks", x: 54, y: 24, fit: "portrait" },
  "panel-1-1.webp": { label: "AI in the Workplace · panel", x: 50, y: 34, fit: "whole" },
  "panel-1-3.webp": { label: "AI in the Workplace · speaker portrait", x: 67, y: 20, fit: "portrait" },
  "panel-2-1.webp": { label: "Expanding Career Horizons · panel", x: 48, y: 21, fit: "whole" },
  "panel-3-1.webp": { label: "Building Biomanufacturing Capacity · panel", x: 50, y: 37, fit: "whole" },
  "program-impact-2.webp": { label: "Program impact update", x: 65, y: 23, fit: "portrait" },
  "venturelift-showcase-2.webp": { label: "VentureLift · room-wide view", x: 50, y: 42, fit: "whole" },
  "venture-northmirs-3.webp": { label: "VentureLift · presenter portrait", x: 75, y: 20, fit: "portrait" },
  "training-microbix-4.webp": { label: "Training Week · Microbix group photo", x: 50, y: 55, fit: "whole" },
  "training-discovery-to-delivery-1.webp": { label: "Discovery to Delivery · lab tour", x: 35, y: 25, fit: "whole" },
  "training-communication-chameleon-1.webp": { label: "Communication Chameleon workshop", x: 65, y: 25, fit: "cover" },
  "training-negotiation-navigator-1.webp": { label: "Negotiation Navigator workshop", x: 73, y: 23, fit: "portrait" },
  "training-innovation-ignited-1.webp": { label: "Innovation Ignited · presentation", x: 74, y: 62, fit: "whole" },
  "training-innovation-ignited-2.webp": { label: "Innovation Ignited · poster session", x: 49, y: 32, fit: "whole" },
  "discussion-3.webp": { label: "Interactive Discussion · at the table", x: 50, y: 25, fit: "whole" },
  "networking-2.webp": { label: "Networking · conversation at the table", x: 50, y: 27, fit: "whole" },
} as const satisfies Record<string, PhotoPreset>;

export type ReportPhotoFile = keyof typeof reportPhotos;
export const REPORT_ASSETS = "/api/workspace/symposium-2026/report/assets";

export function photoPreset(file: ReportPhotoFile): ReportPhoto {
  const { x, y, fit } = reportPhotos[file];
  return { file, x, y, fit };
}

const sectionPhotos: Record<string, ReportPhotoFile[]> = {
  "executive-summary": ["cover.jpg"],
  "training-week": ["microbix.jpg", "training-microbix-4.webp", "training-discovery-to-delivery-1.webp"],
  "annual-symposium": ["keynote.jpg", "welcome-1.webp"],
  panels: ["panel-1-1.webp", "panel-1-3.webp", "panel-2-1.webp", "panel-3-1.webp"],
  venturelift: ["venture.jpg", "venture-northmirs-3.webp", "venturelift-showcase-2.webp"],
  discussion: ["roundtable.jpg", "discussion-3.webp"],
  "program-impact": ["program-impact-2.webp"],
  "professional-development": ["training-communication-chameleon-1.webp", "training-negotiation-navigator-1.webp"],
  "pitch-competition": ["training-innovation-ignited-1.webp", "training-innovation-ignited-2.webp"],
  "follow-through": ["network.jpg", "networking-2.webp"],
};

export function pagePhoto(page: ReportPage, index: number, recommendations: Record<string, ReportPhoto[]> = {}): ReportPhoto {
  const choices = recommendations[page.id];
  const options = sectionPhotos[page.id] ?? ["cover.jpg"];
  const original = index === 0 && page.image && page.image !== "registration" ? `${page.image}.jpg` as const : null;
  return page.photos?.[String(index)] ?? (choices?.length ? choices[index % choices.length] : photoPreset(original ?? options[index % options.length]));
}

export function photoLabel(photo: ReportPhoto) {
  return photo.caption ?? (Object.hasOwn(reportPhotos, photo.file) ? reportPhotos[photo.file as ReportPhotoFile].label : "Symposium photograph");
}

export function portraitPhotos(page: ReportPage) {
  return Object.entries(page.photos ?? {}).filter(([key]) => key.startsWith("portrait-")).sort(([a], [b]) => a.localeCompare(b));
}

export function stripPhotos(page: ReportPage, index: number) {
  const portraits = index === 0 ? portraitPhotos(page) : [];
  if (portraits.length) return portraits;
  return Object.entries(page.photos ?? {}).filter(([key]) => key.startsWith(`photo-${index}-`)).sort(([a], [b]) => a.localeCompare(b));
}

export function portraitHeight(count: number) {
  return 684 * 144 * count / (684 - 10 * (count - 1));
}

export function hasLeadPhoto(page: ReportPage, index: number) {
  return index === 0 && page.image !== "registration" && (page.id === "panels" || Boolean(page.image) || stripPhotos(page, index).length > 0);
}

export function hasTrainingPhotoGrid(page: ReportPage, index: number) {
  return page.id === "training-week" && index === 1
    && Boolean(page.photos?.[String(index)]) && stripPhotos(page, index).length === 5;
}

export const MIN_FILL_PHOTO = 112;
export const PHOTO_CAPTION_SPACE = 23;
export const PHOTO_GAP = 13;
export const PORTRAIT_STRIP_SPACE = 144 + 34 + PHOTO_GAP;
const TRAINING_TILE_HEIGHT = 222;
export const TRAINING_TILE_PREVIEW_HEIGHT = 684 * TRAINING_TILE_HEIGHT / 337;
export const TRAINING_PHOTO_GRID_SPACE = 3 * (TRAINING_TILE_HEIGHT + 34) + 20 + PHOTO_GAP;
