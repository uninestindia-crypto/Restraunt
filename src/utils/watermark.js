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

  if (stored !== APP_BUILD_VERSION) {
    console.log(
      `[VersionGate] Build changed: "${stored}" → "${APP_BUILD_VERSION}". Clearing stale auth state.`
    );

    // Wipe auth tokens that may reference old/stale staff data
    localStorage.removeItem('auth_staff_pin');
    localStorage.removeItem('auth_staff_email');
    localStorage.removeItem('auth_failed_attempts');
    localStorage.removeItem('auth_lockout_until');

    // Stamp the new version
    localStorage.setItem(STORAGE_KEY, APP_BUILD_VERSION);
  }
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
