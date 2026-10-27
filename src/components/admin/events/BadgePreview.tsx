import { badgeLayout } from "@/lib/events/badge-layout";
import type { BadgeEdit } from "@/lib/events/print-jobs";

export function BadgePreview({ badge }: { badge: BadgeEdit }) {
  let lines;
  try { lines = badgeLayout({ ...badge, name: badge.name || "Full name" }); }
  catch (error) { return <p role="alert" className="text-sm text-red-700">{error instanceof Error ? error.message : "Check badge details before printing."}</p>; }
  return <svg viewBox="0 0 288 216" role="img" aria-label={`Badge preview for ${badge.name || "Full name"}`} className="block aspect-[4/3] w-full bg-white">
    <style>{`@font-face{font-family:BadgeInstrument;src:url('/print/InstrumentSans-Regular.ttf')}@font-face{font-family:BadgeInstrument;src:url('/print/InstrumentSans-Bold.ttf');font-weight:700}@font-face{font-family:BadgeNoto;src:url('/print/NotoSans-Regular.ttf')}`}</style>
    <image href="/print/badge-v19-background-1.png" width="288" height="216" />
    {lines.map((line, i) => <text key={i} x={line.x} y={line.y} fontSize={line.size} fill={line.color} fontFamily={line.font === "fallback" ? "BadgeNoto" : "BadgeInstrument"} fontWeight={line.font === "bold" ? 700 : 400} style={{ fontKerning: "none", letterSpacing: 0 }} textLength={line.width} lengthAdjust="spacingAndGlyphs">{line.text}</text>)}
  </svg>;
}
