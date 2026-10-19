export function CapacityBarMarkers({ scale, markers }: { scale: number; markers: { value: number; label: string }[] }) {
  const grouped = new Map<number, string[]>();
  for (const marker of markers) {
    const position = Math.min(100, Math.max(0, marker.value / Math.max(1, scale) * 100));
    grouped.set(position, [...(grouped.get(position) ?? []), marker.label]);
  }
  const points = [...grouped].sort(([a], [b]) => a - b);
  const staggered = points.length > 1 && points[1][0] - points[0][0] < 38;
  return <div aria-hidden="true" className={`capacity-bar-markers${staggered ? " capacity-bar-markers-staggered" : ""}`}>
    {points.map(([position, labels], index) => <span key={position} className="capacity-bar-marker" style={{ left: `${position}%` }}>
      <span className="capacity-bar-tick" />
      <span className="capacity-bar-label" data-align={position < 35 ? "start" : position > 65 ? "end" : "center"} data-lane={staggered ? index : 0}>
        {labels.join(" / ")}
      </span>
    </span>)}
  </div>;
}
