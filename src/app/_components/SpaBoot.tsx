"use client";

import { useEffect } from 'react';

/**
 * Boots the SPA over the server-rendered storefront — but not while the visitor is still reading.
 *
 * The marketing pages are real HTML in the export. The ordering app behind them is ~700 KB of
 * JavaScript that opens IndexedDB, seeds a menu, starts a sync service and reaches for Supabase.
 * Loading all of that during first paint is what Lighthouse was measuring on the home page: time
 * to interactive above 10s, 587 KiB of JavaScript it could see was never used, and seconds of main
 * thread work — on a page whose only job is to be read and tapped once.
 *
 * So the boot is scheduled by intent instead of by page load:
 *
 *   - a hash route (`/#/self-order`) is a direct request for the app — boot immediately;
 *   - the first pointer or key press means the visitor is about to act — boot then;
 *   - otherwise wait for the browser to be idle, with a timeout so it always happens.
 *
 * By the time a thumb travels to "Order now" the bundle is already arriving, and the page was
 * interactive long before it started.
 */
export function SpaBoot() {
  useEffect(() => {
    let booted = false;
    let idleHandle: number | undefined;

    const boot = () => {
      if (booted) return;
      booted = true;
      cleanup();
      import('../../main')
        .then(() => console.log('[Next.js SPA Boot] Main script loaded and initialized.'))
        .catch((err) => console.error('[Next.js SPA Boot] Failed to boot main script:', err));
    };

    const INTENT = ['pointerdown', 'keydown', 'touchstart'] as const;
    const cleanup = () => {
      for (const type of INTENT) window.removeEventListener(type, boot, true);
      window.removeEventListener('hashchange', boot);
      if (idleHandle !== undefined) {
        (window.cancelIdleCallback ?? window.clearTimeout)(idleHandle);
        idleHandle = undefined;
      }
    };

    // Someone linked straight into the app, or is already inside it. The splash stays up until
    // main.ts has the app on screen, which is what it is for.
    if (window.location.hash && window.location.hash !== '#') {
      boot();
      return cleanup;
    }

    // Nobody asked for the app, so this page is the pre-rendered storefront and it is already
    // painted underneath. The splash is an opaque full-screen overlay: leaving it up until the
    // deferred boot fires would hide finished content and hand Lighthouse the splash as the
    // largest contentful paint. Drop it now — main.ts's own call becomes a no-op.
    const splash = document.getElementById('loading-screen');
    if (splash) {
      splash.classList.add('hide');
      window.setTimeout(() => splash.remove(), 500);
    }

    for (const type of INTENT) window.addEventListener(type, boot, { capture: true, passive: true });
    window.addEventListener('hashchange', boot);
    idleHandle = window.requestIdleCallback
      ? window.requestIdleCallback(boot, { timeout: 4000 })
      : (window.setTimeout(boot, 2000) as unknown as number);

    return cleanup;
  }, []);

  return null;
}
