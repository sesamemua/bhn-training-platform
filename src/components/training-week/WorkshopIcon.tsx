import { Compass, createLucideIcon, Factory, Lightbulb, Microscope, Presentation, ShieldPlus } from "lucide-react";

const TalkingChameleon = createLucideIcon("TalkingChameleon", [
  ["path", { d: "M6 16.6C2.8 14.4 3.3 10.2 6.5 8.5c2-1.1 4.5-.9 6.3 0 .1-2.1.7-3.4 1.4-3.9 3.7.5 6.4 3.4 6.8 7.3.1 1.8-1.2 2.9-3.2 2.9-1.3 0-2.3-.4-3.1-1-1.3 3.7-5.4 4.8-8.7 2.8ZM17 12.8q1.2.6 2.4-.1", key: "chameleon" }],
  ["circle", { cx: "16.7", cy: "9.7", r: "2.2", strokeWidth: "1.5", key: "eye" }],
  ["circle", { cx: "17", cy: "9.7", r: ".7", fill: "currentColor", stroke: "none", key: "pupil" }],
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
  return <svg viewBox="3 19 138 76" width="144" height="112" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" focusable="false" className="workshop-chameleon">
    <path d="M11 91c31-4 68 2 119-4" stroke="#7e9b85" strokeWidth="2" />
    <g className="workshop-chameleon-skin">
      <path className="workshop-chameleon-tail" d="M38 70c-15-11-29-5-27 7 2 13 23 13 24 1 1-9-12-13-16-6-3 5 4 9 7 5" />
      <g className="workshop-chameleon-breathe">
        <path d="M34 76C24 67 27 52 39 47Q39 40 47 44Q50 36 57 42Q65 36 70 43Q75 43 78 49M80 62C82 77 65 84 49 81Q40 81 34 76" />
        <path d="M43 59q9-5 18 0" strokeWidth="2" />
      </g>
      <path className="workshop-chameleon-feet" d="M48 76q-5 6-2 11 4 3 10 1M77 74q1 11 7 14 5 1 9-1" />
    </g>
    <g className="workshop-chameleon-head">
      <path className="workshop-chameleon-casque" d="M74 56Q72 45 76 36Q78 30 82 35Q85 39 88 39M105 54Q114 55 110 61Q104 68 94 65Q86 65 80 61" />
      <g className="workshop-chameleon-eyes">
        <g className="workshop-chameleon-turret-near" data-chameleon-eye="true">
          <g className="workshop-chameleon-lid-near">
            <circle cx="95" cy="49" r="11" strokeWidth="2.5" />
            <g className="workshop-chameleon-gaze">
              <circle cx="96" cy="49" r="3.5" fill="currentColor" stroke="none" />
            </g>
          </g>
        </g>
      </g>
      <path className="workshop-chameleon-brow" d="M85 36q7-5 14 0" strokeWidth="2.5" />
      <path d="M94 61q8 5 14-2" strokeWidth="2" />
    </g>
    <g className="workshop-chameleon-tongue">
      <path d="M103 60q17-12 28-24" stroke="#f295a2" strokeWidth="2.5" />
      <ellipse cx="131" cy="36" rx="3.8" ry="2.8" stroke="#f295a2" strokeWidth="2" />
    </g>
    <g className="workshop-chameleon-bug" strokeWidth="1.5">
      <ellipse cx="127" cy="31" rx="3" ry="5" stroke="#dcecf6" transform="rotate(-32 127 31)" />
      <ellipse cx="135" cy="31" rx="3" ry="5" stroke="#dcecf6" transform="rotate(32 135 31)" />
      <path d="m126 37-3 2m13-2 3 2" stroke="#e3c28c" strokeWidth="1.5" strokeLinecap="round" />
      <ellipse cx="131" cy="36" rx="4" ry="3" stroke="#eac17d" />
      <path d="M130 34v4" stroke="#6e5636" strokeWidth="1.5" />
      <circle cx="135" cy="35" r="2" stroke="#f3deab" />
    </g>
  </svg>;
}
