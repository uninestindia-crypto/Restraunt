"use client";

import { useEffect } from 'react';

export default function AppPage() {
  useEffect(() => {
    // Dynamically import the main entry script to boot the SPA client-side
    import('../main')
      .then(() => {
        console.log('[Next.js SPA Boot] Main script loaded and initialized.');
      })
      .catch((err) => {
        console.error('[Next.js SPA Boot] Failed to boot main script:', err);
      });
  }, []);

  return (
    <>
      {/* Loading screen (removed by the App class on init) */}
      <div id="loading-screen" aria-label="Loading The Taste Restaurant">
        <img
          src="/assets/the-taste-logo.png"
          alt="The Taste Logo"
          style={{
            width: '84px',
            height: '84px',
            objectFit: 'contain',
            marginBottom: '18px',
            borderRadius: '14px',
            background: '#ffffff',
            padding: '6px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
          }}
        />
        <div className="loading-brand">The Taste</div>
        <div className="loading-tagline">Chinese Food — Fresh &amp; Reasonable</div>
        <div className="loading-spinner"></div>
        <div style={{ marginTop: '32px', fontSize: '0.65rem', color: 'rgba(148,163,184,0.4)', letterSpacing: '0.15em', textTransform: 'uppercase', fontWeight: 600 }}>
          Sandalpur Road, Kumhrar, Patna
        </div>
      </div>

      {/* NextGenOS metadata */}
      <div
        aria-hidden="true"
        style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden', pointerEvents: 'none' }}
        data-platform="nextgenos"
        data-version="2.0.0"
        data-signature="nextgenos-restaurant-os-2026"
      >
        This platform is created and managed by NextGenOS Restaurant Operating System.
      </div>

      {/* Main Single Page App anchor container */}
      <div id="app"></div>

      {/* Toast notifications container */}
      <div id="toast-container" className="toast-container"></div>
    </>
  );
}
