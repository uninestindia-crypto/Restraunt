/**
 * The connection strip — what the app knows, and how long ago it knew it.
 *
 * This product is online-first over a cache: reads go to Supabase and fall back to the last known
 * rows when the network is not there. That fallback was invisible. The data layer queued writes
 * correctly, served stale rows correctly, and the screen said nothing — so a cashier could not tell
 * a working till from a diverging one, and a guest could not tell a live menu from a remembered one.
 *
 * This is the missing half. It is a *state*, not an event, so it is a persistent strip rather than
 * a toast: it appears when something is true, and it leaves by itself when that stops being true.
 * The disappearance is the confirmation — there is no separate "back online" toast, because the
 * user did not do anything to be congratulated for.
 *
 * `03-components.md` §10 in the taste-os-design skill is the spec this implements.
 */

import { db } from '../db/database';

/**
 * Stores whose unsynced rows represent real work a person did.
 *
 * `orders` first and alone for a guest: a customer cannot edit the menu, so counting menu rows on
 * the storefront reports the device's own scaffolding back to them as pending work. That is how a
 * guest who had placed one order was told 92 changes were waiting.
 */
const OUTBOX_STORES = {
  staff: ['orders', 'menuItems', 'menuCategories', 'customers', 'inventory', 'tables'],
  guest: ['orders']
};

/** Which surface the strip is describing. They have different truths. */
export type Surface = 'staff' | 'guest';

const POLL_MS = 5000;

/**
 * How long after the last answered read the cloud still counts as reachable.
 *
 * This has to exceed the longest gap between reads on a healthy device, or the strip accuses a
 * working connection every time the app is simply idle. The storefront re-pulls its catalogue on
 * a five-minute timer, so anything at or under five minutes guarantees a false warning on a
 * perfectly good connection — which is exactly the bug this constant replaces.
 */
const CLOUD_CONTACT_GRACE_MS = 6 * 60 * 1000;

/**
 * How long the first pull has to land before silence becomes a warning.
 *
 * On a cold load there has been no contact yet, which is not the same as failed contact. Warning
 * immediately means every customer opens the storefront to "Can't reach the cloud right now" for
 * the few seconds the catalogue takes to arrive — an accusation, retracted, before they have done
 * anything. Say nothing until there is something to say.
 */
const STARTUP_GRACE_MS = 12000;

type Mode = 'hidden' | 'offline' | 'stale' | 'pending' | 'blocked';

let host: HTMLElement | null = null;
let timer: any = null;
let lastRendered = '';
let surface: Surface = 'staff';
let mountedAt = 0;

function isOnline() {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

/** How long ago the cloud last answered, in the words a person would use. */
function agoLabel(at: number) {
  if (!at) return '';
  const mins = Math.floor((Date.now() - at) / 60000);
  if (mins < 1) return 'just now';
  if (mins === 1) return '1 min ago';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  return hrs === 1 ? '1 hr ago' : `${hrs} hr ago`;
}

async function countOutbox(surface: Surface) {
  let pending = 0;
  let blocked = 0;
  for (const store of OUTBOX_STORES[surface]) {
    const table = (db as any)[store];
    if (!table) continue;
    try {
      const rows = await table.filter((r: any) => r && r.isSynced === 0).toArray();
      pending += rows.length;
      // A row carrying a refusal will never drain on its own. It is a different message,
      // because the operator has to do something about it.
      blocked += rows.filter((r: any) => String(r.lastSyncError || '').trim()).length;
    } catch {
      // A store missing on this schema version is not an error worth surfacing here.
    }
  }
  return { pending, blocked };
}

async function readState(surface: Surface) {
  const { pending, blocked } = await countOutbox(surface);

  let lastPull = 0;
  let reachable = false;
  try {
    // When a read last succeeded is the honest signal, and the only one a guest has: the
    // storefront never opens a staff sync session, so judging reachability by
    // `syncService.isConnected` told every customer the cloud was unreachable when it was fine.
    //
    // It must be the time of the last answer, not the read-freshness window. That window is three
    // seconds wide and exists to collapse one screen's cascade of reads into one query per table;
    // asking it about reachability meant a storefront that pulls every five minutes spent
    // 99% of its life claiming to be offline with a live menu on screen.
    const { getLastCloudContactAt } = await import('../services/cloudDb');
    lastPull = getLastCloudContactAt();
    reachable = lastPull > 0 && Date.now() - lastPull < CLOUD_CONTACT_GRACE_MS;
  } catch {
    // cloudDb not loaded yet: say nothing rather than guess.
    reachable = true;
  }

  if (surface === 'staff') {
    try {
      const { syncService } = await import('../services/sync');
      // Whichever spoke to the server more recently is the honest "as of" — taking the sync
      // service's alone would report 0 on a till whose reads are working but whose full pull
      // has not run yet.
      lastPull = Math.max(lastPull, syncService?.lastFullPullTime || 0);
      // A staff device additionally has a live channel; either signal counts as reachable.
      reachable = reachable || syncService?.isConnected === true;
    } catch {
      // Sync not loaded yet.
    }
  }

  const offline = !isOnline();
  // Never contacted, but only just started: the first pull is still in flight. Silence, not blame.
  const starting = lastPull === 0 && Date.now() - mountedAt < STARTUP_GRACE_MS;
  const stale = !offline && !reachable && !starting;

  let mode: Mode = 'hidden';
  if (blocked > 0) mode = 'blocked';
  else if (offline) mode = 'offline';
  else if (stale) mode = 'stale';
  else if (pending > 0) mode = 'pending';

  return { mode, pending, blocked, lastPull };
}

function copyFor(mode: Mode, pending: number, blocked: number, lastPull: number) {
  const asOf = lastPull ? ` Showing what we had ${agoLabel(lastPull)}.` : '';
  const queued =
    pending === 0 ? '' : pending === 1 ? ' 1 change is waiting to sync.' : ` ${pending} changes are waiting to sync.`;

  switch (mode) {
    case 'offline':
      // Says what is true, what still works, and what is queued — in that order.
      return {
        tone: 'warn',
        icon: 'cloud_off',
        text: `You're offline. Orders still work and will send when you're back.${asOf}${queued}`
      };
    case 'stale':
      return {
        tone: 'warn',
        icon: 'cloud_alert',
        text: `Can't reach the cloud right now.${asOf}${queued}`
      };
    case 'pending':
      return {
        tone: 'info',
        icon: 'cloud_sync',
        text: `Syncing.${queued}`.replace('Syncing. ', 'Syncing — ')
      };
    case 'blocked':
      return {
        tone: 'error',
        icon: 'error',
        text:
          blocked === 1
            ? "1 change was refused by the cloud and won't send on its own. Open Settings to see why."
            : `${blocked} changes were refused by the cloud and won't send on their own. Open Settings to see why.`
      };
    default:
      return null;
  }
}

async function render() {
  if (!host) return;
  const { mode, pending, blocked, lastPull } = await readState(surface);
  const copy = copyFor(mode, pending, blocked, lastPull);

  // Nothing to say: leave by itself. The absence is the confirmation.
  if (!copy) {
    if (lastRendered) {
      host.innerHTML = '';
      host.hidden = true;
      lastRendered = '';
    }
    return;
  }

  const key = `${copy.tone}|${copy.text}`;
  if (key === lastRendered) return;
  lastRendered = key;

  host.hidden = false;
  host.innerHTML = `
    <div class="connection-strip connection-strip--${copy.tone}" role="status" aria-live="polite">
      <span class="material-symbols-rounded" aria-hidden="true">${copy.icon}</span>
      <span class="connection-strip-text">${copy.text}</span>
    </div>
  `;
}

/**
 * Mount the strip. Idempotent: calling it twice reuses the same host, so a route change that
 * re-runs setup does not stack two banners.
 */
export function mountConnectionBanner(
  parent: HTMLElement | null = document.body,
  as: Surface = 'staff'
) {
  if (!parent) return;
  surface = as;
  if (!mountedAt) mountedAt = Date.now();

  if (!host || !host.isConnected) {
    host = document.getElementById('connection-banner-host');
    if (!host) {
      host = document.createElement('div');
      host.id = 'connection-banner-host';
      host.hidden = true;
      parent.insertBefore(host, parent.firstChild);
    }
  }

  render();

  if (!timer) {
    timer = setInterval(render, POLL_MS);
    window.addEventListener('online', render);
    window.addEventListener('offline', render);
  }
}

export function unmountConnectionBanner() {
  if (timer) {
    clearInterval(timer);
    timer = null;
    window.removeEventListener('online', render);
    window.removeEventListener('offline', render);
  }
  if (host) {
    host.remove();
    host = null;
  }
  lastRendered = '';
  mountedAt = 0;
}

/** Exposed for tests: the copy rules, without the DOM or the database. */
export const __test__ = { copyFor, agoLabel };
