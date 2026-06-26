// @ts-nocheck
/**
 * ═══════════════════════════════════════════════════
 *  NextGenOS Restaurant Operating System
 *  Module: Secure Cryptographic Utilities
 *  Version: 2.0.0
 *  © 2026 NextGenOS. All Rights Reserved.
 *  This software is proprietary and confidential.
 * ═══════════════════════════════════════════════════
 */

/**
 * Hash a string (like a PIN) using native Web Crypto API SHA-256.
 * @param {string} rawString - The plain-text string to hash
 * @returns {Promise<string>} The 64-character hexadecimal SHA-256 hash
 */
export async function hashPin(rawString) {
  if (!rawString) return '';
  
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(rawString.trim());
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
  } catch (error) {
    console.error('[Crypto] Web Crypto hashing failed, falling back to simple SHA-256 mock/error:', error);
    throw new Error('Cryptographic hashing operation failed.');
  }
}
