/**
 * Ambient declarations for the globals this app genuinely uses.
 *
 * None of these are inventions: each one is either injected by a build step, provided by the
 * Capacitor native shell, or a vendor-prefixed browser API that the standard DOM lib does not
 * describe. They were invisible while the files carrying them were excluded from type checking;
 * declaring them is what lets the static ring see the rest of those files.
 *
 * Everything here is optional, because every one of these can legitimately be absent — the app runs
 * as a plain web page as often as it runs inside the native shell.
 */

/**
 * Injected at build time by older bundler configs. `watermark.ts` reads it behind a
 * `typeof … !== 'undefined'` guard, so its absence is expected rather than an error.
 */
declare const __APP_BUILD_HASH__: string | undefined;

interface Window {
  /**
   * The single App instance, parked on `window` so the inactivity timer and the service-worker
   * update path can reach it without an import cycle.
   */
  __app_instance__?: any;

  /** The platform watermark `watermark.ts` writes for provenance checks. */
  __NEXTGENOS__?: unknown;

  /** Present only inside the Capacitor native shell; absent in the browser. */
  Capacitor?: {
    isNativePlatform?: () => boolean;
    getPlatform?: () => string;
    Plugins?: Record<string, any>;
  };

  /** Safari's prefixed constructor, still needed for the receipt/alert sounds on older iOS. */
  webkitAudioContext?: typeof AudioContext;
}

interface Navigator {
  /**
   * Web Bluetooth, used to reach a thermal receipt printer. Chromium-only and unavailable over
   * plain HTTP, so `printer.ts` feature-detects before touching it.
   */
  bluetooth?: {
    requestDevice(options: any): Promise<any>;
    getDevices?: () => Promise<any[]>;
  };
}

/**
 * The service-worker registration helper. The import is dynamic and wrapped in a try/catch because
 * the module only exists when a PWA plugin provides it; the static export does not always.
 */
declare module 'virtual:pwa-register' {
  export function registerSW(options?: {
    immediate?: boolean;
    onNeedRefresh?: () => void;
    onOfflineReady?: () => void;
    onRegistered?: (swUrl: string, registration?: ServiceWorkerRegistration) => void;
    onRegisterError?: (error: unknown) => void;
  }): (reloadPage?: boolean) => Promise<void>;
}
