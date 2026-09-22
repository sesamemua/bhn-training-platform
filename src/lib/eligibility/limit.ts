/**
 * The sliding window both public eligibility endpoints share.
 *
 * Honest about what this is: serverless means one map per warm
 * instance, so it is a speed bump rather than a wall. It still turns
 * "paste in a wordlist" into something slow and conspicuous, and these
 * endpoints leak one bit per call at best. A shared store would be
 * better and is not worth a Redis dependency for this.
 *
 * One module rather than a copy in each route: the check and the
 * "tell us" button are the same surface to anybody probing it, and two
 * limiters that drift apart is how the looser one becomes the way in.
 */
const buckets = new Map<string, Map<string, number[]>>();

/** True when this key has already had its allowance within the window. */
export function limited(name: string, key: string, windowMs: number, max: number, now: number): boolean {
  let map = buckets.get(name);
  if (!map) buckets.set(name, (map = new Map()));
  const recent = (map.get(key) ?? []).filter((t) => now - t < windowMs);
  recent.push(now);
  map.set(key, recent);
  // Keep the map from growing without bound on a long-lived instance.
  if (map.size > 5000) {
    for (const [k, v] of map) if (v.every((t) => now - t >= windowMs)) map.delete(k);
  }
  return recent.length > max;
}

/** The caller's address, as far as the platform can tell. */
export function callerIp(headers: Headers): string {
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip") ||
    "unknown"
  );
}
