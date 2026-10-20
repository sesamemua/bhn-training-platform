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

export function WorkshopIcon({ slug, size = 22, animated = false }: { slug: string; size?: number; animated?: boolean }) {
  const workshop = WORKSHOP_ICONS[slug as keyof typeof WORKSHOP_ICONS];
  const Icon = workshop?.Icon ?? Presentation;
  if (animated) return <span className="workshop-animation" data-workshop-icon={workshop?.asset ?? "workshop"} aria-hidden="true" style={{ width: size, height: size }}>
    {slug === "communication-chameleon-2026" ? <SneakyChameleon /> : <Icon size={size * 0.7} strokeWidth={1.5} focusable="false" className="workshop-animation-symbol" />}
  </span>;
  return <Icon size={size} strokeWidth={2} aria-hidden="true" focusable="false" className="inline-block shrink-0 align-[-0.2em]" />;
}

function SneakyChameleon() {
  return <svg viewBox="0 0 144 112" width="144" height="112" fill="none" focusable="false" className="workshop-chameleon">
    <path d="M11 91c31-4 68 2 119-4" stroke="#7e9b85" strokeWidth="4" strokeLinecap="round" />
    <g className="workshop-chameleon-skin">
      <path d="M38 70c-15-11-29-5-27 7 2 13 23 13 24 1 1-9-12-13-16-6-3 5 4 9 7 5" stroke="currentColor" strokeWidth="9" strokeLinecap="round" />
      <ellipse cx="57" cy="62" rx="31" ry="21" fill="currentColor" />
      <path d="m37 46 5-8 8 5 7-9 8 9 8-6 4 12" fill="currentColor" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
      <circle cx="81" cy="40" r="8" fill="currentColor" />
      <path d="M74 47c-1-17 17-22 27-8 6 9 11 18 7 23-5 6-20 4-28-2" fill="currentColor" />
      <path d="m48 76-3 12 10 1m21-16 5 14 11 1" stroke="currentColor" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M43 57c8-5 17-5 24 0" stroke="#183f39" strokeOpacity=".2" strokeWidth="3" strokeLinecap="round" />
      <circle cx="43" cy="64" r="2" fill="#183f39" fillOpacity=".2" />
      <circle cx="53" cy="69" r="2.5" fill="#183f39" fillOpacity=".2" />
      <circle cx="65" cy="65" r="2" fill="#183f39" fillOpacity=".2" />
    </g>
    <g className="workshop-chameleon-eyes">
      <circle cx="81" cy="39" r="5" fill="#f4f5d8" />
      <circle cx="94" cy="47" r="11" fill="#f4f5d8" />
      <g className="workshop-chameleon-gaze">
        <circle cx="82" cy="39" r="2.5" fill="#173e38" />
        <circle cx="96" cy="47" r="4.5" fill="#173e38" />
        <circle cx="97" cy="45.5" r="1.3" fill="white" />
      </g>
    </g>
    <path d="M94 60q7 3 13-1" stroke="#244e3b" strokeWidth="2" strokeLinecap="round" />
    <g className="workshop-chameleon-tongue">
      <path d="M103 60q17-12 28-24" stroke="#f295a2" strokeWidth="3.5" strokeLinecap="round" />
      <ellipse cx="131" cy="36" rx="3.8" ry="2.8" fill="#f295a2" />
    </g>
    <g className="workshop-chameleon-bug">
      <ellipse cx="127" cy="31" rx="3" ry="5" fill="#dcecf6" fillOpacity=".85" transform="rotate(-32 127 31)" />
      <ellipse cx="135" cy="31" rx="3" ry="5" fill="#dcecf6" fillOpacity=".85" transform="rotate(32 135 31)" />
      <path d="m126 37-3 2m13-2 3 2" stroke="#e3c28c" strokeWidth="1.5" strokeLinecap="round" />
      <ellipse cx="131" cy="36" rx="4" ry="3" fill="#eac17d" />
      <path d="M130 34v4" stroke="#6e5636" strokeWidth="1.5" />
      <circle cx="135" cy="35" r="2" fill="#f3deab" />
    </g>
  </svg>;
}
