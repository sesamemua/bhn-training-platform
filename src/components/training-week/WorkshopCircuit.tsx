export function WorkshopCircuit({ seed }: { seed: string }) {
  const hash = [...seed].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 0);
  const paths = Array.from({ length: 8 }, (_, i) => {
    const y = 12 + i * 19;
    const bend = 65 + ((hash >>> (i * 3)) % 19) * 32;
    const step = (i % 2 ? 1 : -1) * (10 + (hash % 3) * 4);
    return `M0 ${y} H${bend} l18 ${step} h${80 + (hash % 7) * 21} l18 ${-step} H1000`;
  }).join(" ");
  const chipX = 330 + hash % 390;
  return <svg className="training-workshop-circuit" aria-hidden="true" viewBox="0 0 1000 170" preserveAspectRatio="none" focusable="false">
    <path d={paths} className="training-circuit-traces" fill="none" />
    <path d={paths} className="training-circuit-power" pathLength={100} fill="none" style={{ animationDelay: `-${hash % 19}s` }} />
    <g className="training-circuit-pads">
      {Array.from({ length: 8 }, (_, i) => <circle key={i} cx={55 + (hash + i * 113) % 890} cy={12 + i * 19} r={3} />)}
      <rect x={chipX} y={51} width={68} height={58} rx={3} />
      {Array.from({ length: 6 }, (_, i) => <path key={i} d={`M${chipX - 9} ${58 + i * 9}h9 M${chipX + 68} ${58 + i * 9}h9`} />)}
    </g>
  </svg>;
}
