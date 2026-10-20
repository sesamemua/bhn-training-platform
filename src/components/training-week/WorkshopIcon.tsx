import { Compass, createLucideIcon, Factory, Lightbulb, Microscope, Presentation, ShieldPlus } from "lucide-react";

const TalkingChameleon = createLucideIcon("TalkingChameleon", [
  ["path", { d: "M6 16.6C2.8 14.4 3.3 10.2 6.5 8.5c2-1.1 4.5-.9 6.3 0 .1-2.1.7-3.4 1.4-3.9 3.7.5 6.4 3.4 6.8 7.3.1 1.8-1.2 2.9-3.2 2.9-1.3 0-2.3-.4-3.1-1-1.3 3.7-5.4 4.8-8.7 2.8ZM18.8 10a2.2 2.2 0 1 0-4.4 0 2.2 2.2 0 1 0 4.4 0ZM17 12.8q1.2.6 2.4-.1.3-.2.5.1.2.3-.1.5-1.5.9-3.1.1-.3-.2-.1-.5.1-.3.4-.1Z", fill: "currentColor", fillRule: "evenodd", stroke: "none", key: "chameleon" }],
  ["circle", { cx: "17", cy: "9.7", r: ".85", fill: "currentColor", stroke: "none", key: "eye" }],
  ["path", { d: "M6 14.8c-4.1-.1-5.5 3-3.6 5.6 1.6 2.3 5.4 2 6.4-.3 1-2.2-1.1-4.1-2.8-3.1-1.4.8-.7 2.5.6 1.8", strokeWidth: "1.7", key: "spiral-tail" }],
  ["path", { d: "M10 16.5q.2 3 2.8 3m2.3-5.3q.5 2.6 3 2.6", strokeWidth: "1.7", key: "feet" }],
]);

export const WORKSHOP_ICONS = {
  "catalent-tour-lunch-learn-2026": { Icon: Microscope, colour: "#0369a1", symbol: "Microscope", asset: "microbix-tour" },
  "cl3-workshop-2026": { Icon: ShieldPlus, colour: "#6d28d9", symbol: "Preparedness shield", asset: "pandemic-preparedness" },
  "communication-chameleon-2026": { Icon: TalkingChameleon, colour: "#0f766e", symbol: "Chameleon", asset: "communication-chameleon" },
  "negotiation-skills-2026": { Icon: Compass, colour: "#a21caf", symbol: "Navigation compass", asset: "negotiation-navigator" },
  "ccrm-tour-lunch-learn-2026": { Icon: Factory, colour: "#1d4ed8", symbol: "Biomanufacturing", asset: "discovery-to-delivery-ccrm" },
  "innovation-showcase-2026": { Icon: Lightbulb, colour: "#0e7490", symbol: "Ignited idea", asset: "innovation-ignited" },
} as const;

export function WorkshopIcon({ slug, size = 22 }: { slug: string; size?: number }) {
  const Icon = WORKSHOP_ICONS[slug as keyof typeof WORKSHOP_ICONS]?.Icon ?? Presentation;
  return <Icon size={size} strokeWidth={2} aria-hidden="true" focusable="false" className="inline-block shrink-0 align-[-0.2em]" />;
}
