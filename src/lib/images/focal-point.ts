/**
 * Where the eye goes in a photo — its perceptual centre, not the middle
 * of its pixels.
 *
 * Each pixel is scored by what draws attention:
 *   • how much its colour stands out from the picture as a whole, measured
 *     in Lab (frequency-tuned saliency, Achanta et al. 2009) — perceptual
 *     colour distance, so a red jacket on grey counts and a slightly
 *     different grey does not;
 *   • detail — edges in lightness, where a subject in focus sits against
 *     a softer background;
 *   • skin tones, because a person's face is what anyone looks at first;
 *   • a mild pull toward the middle, the way people frame what matters.
 * The focal point is the weighted centre of the strongest-scoring part.
 * Also says whether it looks like a person, so a crop can leave headroom.
 *
 * Pure: give it RGBA pixels (a small copy — ~160px on the long side is
 * plenty and fast). No canvas, no DOM.
 * ponytail: a heuristic, not a face detector — a busy background can
 * pull it off. Swap in a face model if that turns out to matter.
 */
export interface Pixels { data: Uint8ClampedArray | number[]; width: number; height: number }
export interface Focus { x: number; y: number; person: boolean }

const lin = (c: number) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);

/** sRGB → CIE Lab (D65). */
function lab(r: number, g: number, b: number): [number, number, number] {
  const R = lin(r), G = lin(g), B = lin(b);
  const x = f((R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047);
  const y = f(R * 0.2126 + G * 0.7152 + B * 0.0722);
  const z = f((R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

/** Skin, by the usual YCbCr box — loose on purpose, every skin tone included. */
function skin(r: number, g: number, b: number): number {
  const y = 0.299 * r + 0.587 * g + 0.114 * b;
  const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
  const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
  return y > 40 && cb >= 77 && cb <= 127 && cr >= 133 && cr <= 173 ? 1 : 0;
}

/** Two passes of a 3×3 box blur ≈ a small Gaussian. */
function blur(a: Float32Array, w: number, h: number): Float32Array {
  let src = a;
  for (let pass = 0; pass < 2; pass++) {
    const out = new Float32Array(src.length);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let s = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < w && yy < h) { s += src[yy * w + xx]; n++; }
      }
      out[y * w + x] = s / n;
    }
    src = out;
  }
  return src;
}

const normalise = (a: Float32Array) => {
  let m = 0;
  for (const v of a) if (v > m) m = v;
  if (m > 0) for (let i = 0; i < a.length; i++) a[i] /= m;
  return a;
};

export function focalPoint({ data, width: w, height: h }: Pixels): Focus {
  const n = w * h;
  if (!n) return { x: 0.5, y: 0.5, person: false };
  const L = new Float32Array(n), A = new Float32Array(n), B = new Float32Array(n), S = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    [L[i], A[i], B[i]] = lab(r, g, b);
    S[i] = skin(r, g, b);
  }
  const Lb = blur(L, w, h), Ab = blur(A, w, h), Bb = blur(B, w, h), Sb = blur(S, w, h);
  let mL = 0, mA = 0, mB = 0;
  for (let i = 0; i < n; i++) { mL += Lb[i]; mA += Ab[i]; mB += Bb[i]; }
  mL /= n; mA /= n; mB /= n;

  const colour = new Float32Array(n), edge = new Float32Array(n);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    colour[i] = Math.hypot(Lb[i] - mL, Ab[i] - mA, Bb[i] - mB);
    if (x > 0 && y > 0 && x < w - 1 && y < h - 1) {
      const p = (dx: number, dy: number) => L[(y + dy) * w + x + dx];
      const gx = p(1, -1) + 2 * p(1, 0) + p(1, 1) - p(-1, -1) - 2 * p(-1, 0) - p(-1, 1);
      const gy = p(-1, 1) + 2 * p(0, 1) + p(1, 1) - p(-1, -1) - 2 * p(0, -1) - p(1, -1);
      edge[i] = Math.hypot(gx, gy);
    }
  }
  normalise(colour); normalise(blur(edge, w, h)).forEach((v, i) => { edge[i] = v; });

  let skinShare = 0;
  for (let i = 0; i < n; i++) skinShare += Sb[i];
  skinShare /= n;
  // Skin only counts for much once there is a person's worth of it.
  const skinWeight = skinShare > 0.01 ? 0.8 : 0.2;

  const score = new Float32Array(n);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    const dx = x / (w - 1 || 1) - 0.5, dy = y / (h - 1 || 1) - 0.5;
    const centre = 0.65 + 0.35 * Math.exp(-(dx * dx + dy * dy) / (2 * 0.3 * 0.3));
    score[i] = (0.5 * colour[i] + 0.35 * edge[i] + skinWeight * Sb[i]) * centre;
  }
  // The strongest 20% decides; squared, so the peak outweighs the plateau.
  const cut = [...score].sort((a, b) => a - b)[Math.floor(n * 0.8)];
  let sx = 0, sy = 0, sw = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = score[y * w + x];
    if (v < cut) continue;
    const k = v * v;
    sx += k * (x + 0.5); sy += k * (y + 0.5); sw += k;
  }
  if (!sw) return { x: 0.5, y: 0.5, person: false };
  return { x: sx / sw / w, y: sy / sw / h, person: skinShare > 0.01 };
}

/**
 * Where to put the image so its focal point sits where the eye expects it
 * in a square frame of side `box`: centred, or a little above centre for a
 * person (headroom). Clamped so the image still covers the frame.
 */
export function offsetFor(focus: Focus, drawn: { w: number; h: number }, box: number) {
  const ty = focus.person ? 0.45 : 0.5;
  const clamp = (v: number, lim: number) => Math.max(-lim, Math.min(lim, v));
  return {
    x: clamp(drawn.w * (0.5 - focus.x), Math.max(0, (drawn.w - box) / 2)),
    y: clamp(box * (ty - 0.5) + drawn.h * (0.5 - focus.y), Math.max(0, (drawn.h - box) / 2)),
  };
}
