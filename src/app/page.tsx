import { SpaBoot } from './_components/SpaBoot';
import { StorefrontJsonLd } from './_components/StorefrontJsonLd';
import { StorefrontSeoShell } from './_components/StorefrontSeoShell';

/**
 * Server component: everything except `SpaBoot` is real markup in the export.
 *
 * The loading screen sits above the pre-rendered storefront while the bundle
 * arrives. Without JavaScript the loading screen is hidden instead (see the
 * <noscript> rule), so the menu below stays readable and ordering falls back
 * to the phone number.
 */
export default function AppPage() {
  return (
    <>
      <noscript>
        <style>{`
          #loading-screen { display: none !important; }
          .storefront-seo-shell { position: static !important; }
        `}</style>
      </noscript>

      <StorefrontJsonLd page="home" />

      {/* Loading screen (removed by the App class on init) */}
      <div id="loading-screen" aria-label="Loading The Taste Restaurant">
        <img
          src="/assets/the-taste-logo.png"
          alt="The Taste Logo"
          width={84}
          height={84}
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
        {/* Opaque, not a 40%-alpha grey: at 10px this has to clear AA on its own. */}
        <div style={{ marginTop: '32px', fontSize: '0.7rem', color: '#A9B6C6', letterSpacing: '0.15em', textTransform: 'uppercase', fontWeight: 600 }}>
          Sandalpur Road, Kumhrar, Patna
        </div>
      </div>

      {/* Crawlable / no-JS storefront, removed once the SPA takes over */}
      <StorefrontSeoShell />

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

      <SpaBoot />
    </>
  );
}
