/**
 * ═══════════════════════════════════════════════════
 *  NextGenOS Restaurant Operating System
 *  Module: Read-Through Freshness Tracker
 *  Version: 1.0.0
 *  © 2026 NextGenOS. All Rights Reserved.
 * ═══════════════════════════════════════════════════
 *
 * Bookkeeping for the online-first read path.
 *
 * Every read in the app is served from Supabase and only falls back to the
 * IndexedDB cache when the network or the cloud is unavailable. Done naively
 * that means a burst of network round trips per screen: the POS asks for
 * categories, then items, then items again per category, and a view that
 * re-renders asks for all of it a second time.
 *
 * This tracker collapses that burst into a single request per resource:
 *
 *  - in-flight de-duplication — concurrent callers share one pull instead of
 *    firing N identical queries at Supabase;
 *  - a short freshness window — a pull that just succeeded is reused for the
 *    next `ttlMs`, which is what makes a per-read cloud fetch affordable
 *    without making the data any less live in practice.
 *
 * A failed pull is never marked fresh, so the next read tries the cloud again
 * rather than settling on the cache for the rest of the window.
 *
 * The module is deliberately free of Dexie, Supabase and DOM dependencies so
 * the collapsing rules can be unit-tested directly.
 */

export interface FreshnessRunOptions {
  /**
   * Ignore the freshness window and pull again. An in-flight pull is still
   * shared — it started at most moments ago, so it already reflects the state
   * the caller is asking about.
   */
  force?: boolean;
}

export interface FreshnessTracker {
  /** True while `key` is inside its freshness window. */
  isFresh(key: string): boolean;
  /** Mark `key` fresh for a full window, without pulling. */
  markFresh(key: string): void;
  /** Drop the freshness window for `keys` (all keys when omitted). */
  markStale(keys?: string | string[]): void;
  /** Keys currently inside their freshness window. */
  freshKeys(): string[];
  /**
   * Pull `key` through `fn` unless it is already fresh.
   *
   * @returns true when `key` holds cloud state — either because `fn` succeeded
   *   or because it was still fresh. False when the pull failed or threw, which
   *   tells the caller to serve the local cache.
   */
  run(key: string, fn: () => Promise<boolean>, options?: FreshnessRunOptions): Promise<boolean>;
}

export function createFreshnessTracker(
  { ttlMs, now = () => Date.now() }: { ttlMs: number; now?: () => number }
): FreshnessTracker {
  const freshUntil = new Map<string, number>();
  const inFlight = new Map<string, Promise<boolean>>();

  function isFresh(key: string) {
    const until = freshUntil.get(key);
    return typeof until === 'number' && until > now();
  }

  function markFresh(key: string) {
    freshUntil.set(key, now() + ttlMs);
  }

  function markStale(keys?: string | string[]) {
    if (keys === undefined) {
      freshUntil.clear();
      return;
    }
    for (const key of Array.isArray(keys) ? keys : [keys]) {
      freshUntil.delete(key);
    }
  }

  function freshKeys() {
    return [...freshUntil.keys()].filter(isFresh);
  }

  async function run(key: string, fn: () => Promise<boolean>, options: FreshnessRunOptions = {}) {
    const pending = inFlight.get(key);
    if (pending) return pending;
    if (!options.force && isFresh(key)) return true;

    const pull = (async () => {
      try {
        const ok = await fn();
        if (ok) markFresh(key);
        else markStale(key);
        return ok;
      } catch (error) {
        // Never cache a failure as freshness: the next read must retry the
        // cloud instead of serving the cache for the rest of the window.
        markStale(key);
        console.warn(`[Freshness] Pull for "${key}" failed; serving cached rows:`, error);
        return false;
      } finally {
        inFlight.delete(key);
      }
    })();

    inFlight.set(key, pull);
    return pull;
  }

  return { isFresh, markFresh, markStale, freshKeys, run };
}
