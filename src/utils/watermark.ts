// @ts-nocheck
/**
 * ═══════════════════════════════════════════════════
 *  NextGenOS Restaurant Operating System
 *  Module: Watermark Utilities
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
