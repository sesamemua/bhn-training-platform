import { Compass, createLucideIcon, Factory, Lightbulb, Microscope, Presentation, ShieldPlus } from "lucide-react";

const TalkingChameleon = createLucideIcon("TalkingChameleon", [
  ["path", { d: "M15 2h6a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-2l-3 2V7h-1a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Z", key: "speech" }],
  ["path", { d: "M5 15c0-4 3-6 7-5l2-2 1 4 4 2v2h-5c-2 3-6 3-9 1-2-1-4 0-4 2a3 3 0 0 0 6 0c0-1-2-1-2 0", key: "chameleon" }],
  ["circle", { cx: "14", cy: "13", r: ".6", fill: "currentColor", stroke: "none", key: "eye" }],
  ["path", { d: "m8 17-1 4h2m4-4 1 4h2M6 22h15", key: "perch" }],
]);

export const WORKSHOP_ICONS = {
  "catalent-tour-lunch-learn-2026": { Icon: Microscope, colour: "#0369a1", symbol: "Microscope", asset: "microbix-tour" },
  "cl3-workshop-2026": { Icon: ShieldPlus, colour: "#6d28d9", symbol: "Preparedness shield", asset: "pandemic-preparedness" },
  "communication-chameleon-2026": { Icon: TalkingChameleon, colour: "#0f766e", symbol: "Talking chameleon", asset: "communication-chameleon" },
  "negotiation-skills-2026": { Icon: Compass, colour: "#a21caf", symbol: "Navigation compass", asset: "negotiation-navigator" },
  "ccrm-tour-lunch-learn-2026": { Icon: Factory, colour: "#1d4ed8", symbol: "Biomanufacturing", asset: "discovery-to-delivery-ccrm" },
  "innovation-showcase-2026": { Icon: Lightbulb, colour: "#0e7490", symbol: "Ignited idea", asset: "innovation-ignited" },
} as const;

export function WorkshopIcon({ slug, size = 22 }: { slug: string; size?: number }) {
  const Icon = WORKSHOP_ICONS[slug as keyof typeof WORKSHOP_ICONS]?.Icon ?? Presentation;
  return <Icon size={size} strokeWidth={2} aria-hidden="true" focusable="false" className="inline-block shrink-0 align-[-0.2em]" />;
}
