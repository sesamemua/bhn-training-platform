/**
 * One read of somebody else's endpoint, however many of us are looking.
 *
 * The dashboard polls. Every admin with the tab open used to mean
 * another pair of requests to Luma's public endpoint every two
 * minutes — three people leaving a tab open overnight is about four
 * thousand requests a day at an endpoint nobody gave us a key for.
 * That is how a courtesy becomes a block.
 *
 * So the answer is held for a while and shared: N dashboards produce
 * one request per TTL, not N. Per warm serverless instance rather than
 * globally — a shared store would be exact, and is not worth a Redis
 * for a number that is allowed to be four minutes old.
 *
 * Pure except for the clock, which is injectable so the test does not
 * have to wait five minutes.
 */
export interface Fresh<T> {
  /** The value, computed at most once per `ttlMs` per key. */
  (key: string, make: () => Promise<T>): Promise<T>;
}

export interface FreshOptions {
  ttlMs: number;
  /** Shortest gap between forced reads, so a leaned-on Refresh button cannot become the poll. */
  forceEveryMs?: number;
  now?: () => number;
}

interface Held<T> { at: number; value: T; failed: boolean }

/** How long a failed read is held before the next one is tried: long enough not to hammer, short enough to recover. */
const FAILED_FOR_MS = 20_000;

/**
 * A memo with an age limit.
 *
 * `force` asks for a fresh read and gets one — unless the last read is
 * newer than `forceEveryMs`, which is what stops somebody holding the
 * Refresh button from making the same requests a poll would.
 *
 * A read that comes back empty (null or undefined — the other side timed
 * out, or refused) is a FAILURE, not an answer. It used to be held like
 * any other value, so one slow reply left every dashboard showing "—"
 * for four minutes, and Refresh could not get past it. Now a failure is
 * retried after twenty seconds, and until a read succeeds the last good
 * value is what people see: an hour-old number is more use than none.
 */
export function freshly<T>({ ttlMs, forceEveryMs = 30_000, now = Date.now }: FreshOptions) {
  const held = new Map<string, Held<T>>();
  return async function fresh(key: string, make: () => Promise<T>, force = false): Promise<T> {
    const was = held.get(key);
    const age = was ? now() - was.at : Infinity;
    const limit = was?.failed ? FAILED_FOR_MS : force ? forceEveryMs : ttlMs;
    if (was && age < limit) return was.value;
    const value = await make();
    const failed = value === null || value === undefined;
    // Nothing came back: keep showing what we last knew, and try again soon.
    const shown = failed && was && was.value !== null && was.value !== undefined ? was.value : value;
    held.set(key, { at: now(), value: shown, failed });
    return shown;
  };
}
