// @ts-nocheck
/**
 * ═══════════════════════════════════════════════════
 *  NextGenOS Restaurant Operating System
 *  Module: Watermark Utilities
 *  Version: 2.0.0
 *  © 2026 NextGenOS. All Rights Reserved.
 *  This software is proprietary and confidential.
 * ═══════════════════════════════════════════════════
 */

export const NEXTGENOS = {
  name: 'NextGenOS',
  platform: 'NextGenOS Restaurant Operating System',
  version: '2.0.0',
  copyright: '© 2026 NextGenOS. All Rights Reserved.',
  attribution: 'Created & Managed by NextGenOS',
  signature: 'nextgenos-restaurant-os',
};

/**
 * Deterministic build fingerprint.
 * Vite injects __APP_BUILD_HASH__ at build time (see vite.config.js define).
 * Falls back to NEXTGENOS.version during dev so the gate still works.
 */
export const APP_BUILD_VERSION =
  (typeof __APP_BUILD_HASH__ !== 'undefined' ? __APP_BUILD_HASH__ : null)
  || NEXTGENOS.version;

/**
 * Helper function to clear auth state, cookies, and other memories from local storage.
 */
export function clearStaleState() {
  console.log('[VersionGate] Clearing stale cache, cookies, and auth state.');

  // 1. Wipe auth tokens that may reference old/stale staff/session data
  localStorage.removeItem('auth_staff_pin');
  localStorage.removeItem('auth_staff_email');
  localStorage.removeItem('auth_failed_attempts');
  localStorage.removeItem('auth_lockout_until');
  localStorage.removeItem('gdrive_access_token');
  localStorage.removeItem('gdrive_token_expires');

  // Clear all Supabase client session local storage keys
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && (key.startsWith('sb-') || key.includes('auth') || key.includes('session'))) {
      localStorage.removeItem(key);
      i--; // Decrement i since length has decreased
    }
  }

  // 2. Clear all cookies
  try {
    const cookies = document.cookie.split(";");
    for (let i = 0; i < cookies.length; i++) {
      const cookie = cookies[i];
      const eqPos = cookie.indexOf("=");
      const name = eqPos > -1 ? cookie.substr(0, eqPos).trim() : cookie.trim();
      document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/";
      document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=" + window.location.hostname;
    }
  } catch (cookieErr) {
    console.error('[VersionGate] Error clearing cookies:', cookieErr);
  }
}

/**
 * Version gate — runs once on every app boot.
 * Compares the stored build version in localStorage with the current build.
 * On mismatch (i.e. the app was updated / redeployed):
 *   1. Clears all stale auth tokens so no ghost PIN sessions survive.
 *   2. Stamps the new version into localStorage.
 * This guarantees consistent first-run behaviour across laptop and phone.
 */
export function performVersionGate() {
  const STORAGE_KEY = 'app_build_version';
  const stored = localStorage.getItem(STORAGE_KEY);

  if (stored && stored !== APP_BUILD_VERSION) {
    console.log(
      `[VersionGate] Build changed: "${stored}" → "${APP_BUILD_VERSION}". Triggering local version gate.`
    );

    clearStaleState();

    // 3. Unregister all Service Workers to clear PWA cache and force fetch new files
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations()
        .then(registrations => {
          const promises = registrations.map(r => r.unregister());
          return Promise.all(promises);
        })
        .catch(err => {
          console.error('[VersionGate] Service worker unregister failed:', err);
        })
        .finally(() => {
          // Stamp the new version and reload
          localStorage.setItem(STORAGE_KEY, APP_BUILD_VERSION);
          window.location.reload();
        });
    } else {
      localStorage.setItem(STORAGE_KEY, APP_BUILD_VERSION);
      window.location.reload();
    }
  } else if (!stored) {
    // Stamp the current version on first boot without reload
    localStorage.setItem(STORAGE_KEY, APP_BUILD_VERSION);
  }
}

/**
 * Asynchronously checks the server's version.json file to detect updates.
 * If the remote build version is different from the running code version (APP_BUILD_VERSION):
 *   1. Displays a status message on the loading screen.
 *   2. Clears all cookies, local storage session tokens, and memories.
 *   3. Unregisters all service workers.
 *   4. Reloads the page immediately.
 * @returns {Promise<boolean>} True if an update was triggered and page is reloading.
 */
export async function checkForUpdateAndGate() {
  const STORAGE_KEY = 'app_build_version';
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache' }
    });

    if (!res.ok) return false;

    const data = await res.json();
    const remoteVersion = data?.version;

    if (remoteVersion && remoteVersion !== APP_BUILD_VERSION) {
      console.log(
        `[VersionGate] Remote version mismatch: local="${APP_BUILD_VERSION}", remote="${remoteVersion}". Forcing reload...`
      );

      // Update loading screen text if it exists
      const loadingScreenText = document.querySelector('.loading-tagline');
      if (loadingScreenText) {
        loadingScreenText.textContent = 'Updating platform to latest version...';
        loadingScreenText.style.color = '#FF6B35';
      }

      clearStaleState();

      // Stamp the new version so we don't loop
      localStorage.setItem(STORAGE_KEY, remoteVersion);

      // Unregister service workers and reload
      if ('serviceWorker' in navigator) {
        try {
          const registrations = await navigator.serviceWorker.getRegistrations();
          await Promise.all(registrations.map(r => r.unregister()));
        } catch (swErr) {
          console.error('[VersionGate] Service worker unregister failed:', swErr);
        }
      }

      window.location.reload();
      return true;
    }
  } catch (err) {
    console.debug('[VersionGate] Remote version check skipped or failed:', err.message);
  }
  return false;
}

/**
 * Print NextGenOS console signature on app boot.
 */
export function printConsoleSignature() {
  const style = 'color: #6C5CE7; font-family: monospace; font-size: 11px; line-height: 1.5;';
  console.log(
    `%c╔══════════════════════════════════════════════╗\n` +
    `║                                              ║\n` +
    `║   ◆  N E X T G E N O S                      ║\n` +
    `║      Restaurant Operating System             ║\n` +
    `║      Version 2.0.0                           ║\n` +
    `║                                              ║\n` +
    `║   Created & Managed by NextGenOS             ║\n` +
    `║   © 2026 NextGenOS. All Rights Reserved.     ║\n` +
    `║                                              ║\n` +
    `╚══════════════════════════════════════════════╝`,
    style
  );
}

/**
 * Get the NextGenOS data fingerprint for Supabase records.
 */
export function getDataFingerprint() {
  return {
    _platform: 'nextgenos',
    _platformVersion: '2.0.0',
  };
}

/**
 * Generate the visible footer attribution HTML.
 */
export function getFooterHTML() {
  return `
    <div style="display:flex;align-items:center;justify-content:center;gap:4px;padding:6px 0;opacity:0.4;">
      <span style="color:rgba(108,92,231,0.5);font-size:8px;font-weight:800;">◆</span>
      <span style="font-size:0.5rem;color:rgba(148,163,184,0.4);letter-spacing:0.06em;font-weight:500;">Powered by</span>
      <span style="font-size:0.5rem;color:rgba(108,92,231,0.55);letter-spacing:0.06em;font-weight:600;">NextGenOS</span>
    </div>
  `;
}

/**
 * Inject the build-time global variable.
 */
export function injectBuildGlobal() {
  window.__NEXTGENOS__ = {
    platform: NEXTGENOS.platform,
    version: NEXTGENOS.version,
    build: Date.now().toString(36),
    timestamp: new Date().toISOString(),
    copyright: NEXTGENOS.copyright,
  };
}
