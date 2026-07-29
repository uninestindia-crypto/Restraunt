// @ts-nocheck
/**
 * ═══════════════════════════════════════════════════
 *  NextGenOS Restaurant Operating System
 *  Module: Public Storefront Catalogue Sync
 *  Version: 1.0.0
 *  © 2026 NextGenOS. All Rights Reserved.
 * ═══════════════════════════════════════════════════
 *
 * Live catalogue updates for the anonymous storefront.
 *
 * The staff `syncService` cannot serve this: `connect()` aborts unless Supabase
 * reports an authenticated cloud session, and its Dexie hooks replicate local
 * writes back up — neither is correct for a customer with no account. So the
 * storefront keeps its own strictly read-only channel.
 *
 * Every trigger funnels into the same `fullPull({ publicOnly: true })` rather
 * than applying row payloads directly. That reuses the authoritative mapping
 * and, more importantly, the delete semantics: under the anon RLS policies a
 * dish that goes unavailable simply stops being returned, and the pull is what
 * removes it from the local cache.
 *
 * A dish going unavailable is also the case realtime cannot announce — the
 * updated row no longer satisfies `using (is_available)`, so anon subscribers
 * are never sent it. The visibility/interval refreshes below are what close
 * that gap, and what keep the storefront current if realtime is unavailable
 * to the anon role at all.
 */

import { fullPull, getStoreId } from './cloudDb';
import { getSupabaseClient } from './supabaseClient';

/** Collapses the burst of events an admin bulk edit produces into one pull. */
const REFRESH_DEBOUNCE_MS = 600;

/** Backstop for changes realtime cannot deliver. Paused while the tab is hidden. */
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Start watching the published catalogue.
 *
 * @param {() => (void | Promise<void>)} onCatalogueChange
 *   Called after a pull that changed nothing or everything — the caller
 *   re-reads its state from Dexie. Never called for a failed pull.
 * @returns {() => void} Stops the channel, listeners and timer.
 */
export function startPublicMenuSync(onCatalogueChange) {
  let stopped = false;
  let channel = null;
  let debounceTimer = null;
  let intervalTimer = null;
  let inFlight = null;
  let pendingReason = null;

  const runPull = async (reason) => {
    // An edit that lands mid-pull may or may not be in the rows already being
    // read, so it is queued rather than dropped — otherwise a second save
    // during a bulk menu edit waits for the interval backstop.
    if (inFlight) {
      pendingReason = reason;
      return inFlight;
    }

    inFlight = (async () => {
      try {
        const result = await fullPull({ publicOnly: true });
        if (stopped || !result?.success) return;
        await onCatalogueChange();
        console.log(`[PublicMenuSync] Catalogue refreshed (${reason}).`);
      } catch (error) {
        console.warn(`[PublicMenuSync] Refresh failed (${reason}); keeping cached catalogue:`, error);
      } finally {
        inFlight = null;
        if (pendingReason && !stopped) {
          const queued = pendingReason;
          pendingReason = null;
          scheduleRefresh(queued);
        }
      }
    })();

    return inFlight;
  };

  const scheduleRefresh = (reason) => {
    if (stopped || !navigator.onLine) return;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      void runPull(reason);
    }, REFRESH_DEBOUNCE_MS);
  };

  const handleVisibility = () => {
    if (document.visibilityState === 'visible') scheduleRefresh('tab visible');
  };
  const handleOnline = () => scheduleRefresh('network restored');

  document.addEventListener('visibilitychange', handleVisibility);
  window.addEventListener('online', handleOnline);

  intervalTimer = setInterval(() => {
    if (document.visibilityState === 'visible') scheduleRefresh('periodic');
  }, REFRESH_INTERVAL_MS);

  // Pull once immediately so the storefront replaces its seeded/cached menu as
  // soon as it can, then subscribe for anything that changes afterwards.
  void runPull('initial load');

  void (async () => {
    try {
      const client = await getSupabaseClient({ persistSession: true });
      if (!client || stopped) return;

      const storeFilter = `store_id=eq.${getStoreId()}`;
      channel = client.channel('storefront-menu');

      for (const table of ['menu_categories', 'menu_items', 'tables']) {
        channel.on(
          'postgres_changes',
          { event: '*', schema: 'public', table, filter: storeFilter },
          () => scheduleRefresh(`${table} changed`)
        );
      }

      channel.subscribe((status) => {
        console.log(`[PublicMenuSync] Realtime channel state: ${status}`);
        // A dropped channel means missed edits; re-pull on the way back up.
        if (status === 'SUBSCRIBED') scheduleRefresh('channel subscribed');
      });
    } catch (error) {
      console.warn('[PublicMenuSync] Realtime unavailable; falling back to periodic refresh:', error);
    }
  })();

  return () => {
    stopped = true;
    if (debounceTimer) clearTimeout(debounceTimer);
    if (intervalTimer) clearInterval(intervalTimer);
    document.removeEventListener('visibilitychange', handleVisibility);
    window.removeEventListener('online', handleOnline);
    if (channel) {
      channel.unsubscribe().catch(err => console.warn('[PublicMenuSync] Channel unsubscribe failed:', err));
      channel = null;
    }
  };
}
