"use client";

import { useEffect } from 'react';

/**
 * Boots the SPA over the server-rendered storefront.
 *
 * Kept as the only client component on the page so everything else — the menu,
 * the marketing copy, the structured data — is real HTML in the export, which
 * is what crawlers and no-JS visitors get.
 */
export function SpaBoot() {
  useEffect(() => {
    import('../../main')
      .then(() => {
        console.log('[Next.js SPA Boot] Main script loaded and initialized.');
      })
      .catch((err) => {
        console.error('[Next.js SPA Boot] Failed to boot main script:', err);
      });
  }, []);

  return null;
}
