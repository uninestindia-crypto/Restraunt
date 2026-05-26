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
