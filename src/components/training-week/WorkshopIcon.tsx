import { Compass, createLucideIcon, Factory, Lightbulb, Microscope, Presentation, ShieldPlus } from "lucide-react";

const TalkingChameleon = createLucideIcon("TalkingChameleon", [
  ["path", { d: "M3 1.5h5.5a1 1 0 0 1 1 1V4a1 1 0 0 1-1 1H8l2 1.5L9.5 5H3a1 1 0 0 1-1-1V2.5a1 1 0 0 1 1-1Z", strokeWidth: "1.25", key: "speech" }],
  ["path", { d: "M6 15.8C3.1 14 3.2 10.3 6.2 8.5c2-1.2 4.6-1.2 6.6.1l.6-4.6c4 1 6.2 3.4 6.8 7.3l-2.8.2 2.4 1c-1.5 1.2-3.3 1.4-5.2.7-1.4 3.4-5 4.4-8.6 2.6ZM17 9a1.8 1.8 0 1 0-3.6 0A1.8 1.8 0 1 0 17 9Z", fill: "currentColor", fillRule: "evenodd", stroke: "none", key: "chameleon" }],
  ["circle", { cx: "15.6", cy: "9", r: ".65", fill: "currentColor", stroke: "none", key: "eye" }],
  ["path", { d: "M6 14.8c-4.1-.1-5.5 3-3.6 5.6 1.6 2.3 5.4 2 6.4-.3 1-2.2-1.1-4.1-2.8-3.1-1.4.8-.7 2.5.6 1.8", strokeWidth: "1.7", key: "spiral-tail" }],
  ["path", { d: "m10 15.5 1.5 3H13m2-5 1.2 3H18", strokeWidth: "1.7", key: "feet" }],
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
