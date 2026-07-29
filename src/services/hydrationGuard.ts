/**
 * Shared hydration guard.
 *
 * Local writes normally replicate up to Supabase through the Dexie hooks in
 * sync.ts. During a cloud hydration those writes are *echoes* of cloud state
 * rather than user intent, so replicating them back is wrong in both
 * directions: re-pushing rows the cloud already owns, and — far worse —
 * deleting cloud rows when the local cache is rebuilt.
 *
 * Hydration paths raise this flag around their local writes; the sync hooks
 * read it synchronously and skip replication while it is set.
 *
 * The counter is a depth rather than a boolean so nested or overlapping
 * hydrations cannot clear the guard early.
 */
let hydrationDepth = 0;

/** True while a cloud hydration is writing to the local cache. */
export function isHydrating() {
  return hydrationDepth > 0;
}

/** Run `fn` with the hydration guard raised for its entire duration. */
export async function runWithHydrationGuard<T>(fn: () => Promise<T>): Promise<T> {
  hydrationDepth++;
  try {
    return await fn();
  } finally {
    hydrationDepth--;
  }
}
