import React, { useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { authService } from '../services/auth';
import { playSound, showToast, vibrateDevice } from '../utils/helpers';

type LoginCallback = (staff: unknown) => void;

type StaffLoginProps = {
  onClose: () => void;
  onLoginSuccess: LoginCallback;
};

const featureRows = [
  ['sync', 'Real-time sync', 'Orders and table state stay aligned across authorized staff devices.'],
  ['shield_lock', 'Cloud authorization', 'Every staff session is verified by Supabase Auth and active membership.'],
  ['monitoring', 'Operational reporting', 'Sales, inventory, and customer reports in one controlled workspace.']
] as const;

function StaffLogin({ onClose, onLoginSuccess }: StaffLoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email.trim() || !password) {
      setError('Email and password are required.');
      return;
    }

    setError('');
    setIsSubmitting(true);
    try {
      const staff = await authService.loginWithCloudCredentials(email.trim(), password);
      if (!staff) throw new Error('Could not resolve an authorized staff session.');

      playSound(900, 100);
      vibrateDevice([40, 20, 40]);
      showToast(`Welcome, ${staff.name}`, 'success');
      onLoginSuccess(staff);
    } catch (loginError) {
      playSound(200, 200);
      vibrateDevice([100]);
      setError(loginError instanceof Error ? loginError.message : 'Sign-in failed.');
      setIsSubmitting(false);
    }
  };

  const resetLocalSession = async () => {
    if (!window.confirm('Clear this device session and offline cache? Unsynced local work on this device will be removed.')) return;

    localStorage.clear();
    sessionStorage.clear();
    try {
      await new Promise<void>((resolve) => {
        const request = indexedDB.deleteDatabase('TheTastePOS');
        request.onsuccess = () => resolve();
        request.onerror = () => resolve();
        request.onblocked = () => resolve();
      });
    } finally {
      window.location.reload();
    }
  };

  return (
    <div className="login-screen" style={{ position: 'fixed', inset: 0, zIndex: 9998, display: 'flex', background: 'var(--bg-primary)', overflow: 'auto' }}>
      <section aria-label="The Taste staff sign in" style={{ width: '100%', minHeight: '100%', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', alignItems: 'stretch' }}>
        <aside className="login-brand-panel" style={{ padding: 'clamp(32px, 6vw, 72px)', background: 'linear-gradient(135deg, var(--chart-ink), var(--chart-ink-deep))', color: '#fff' }}>
          <img src="/assets/the-taste-logo.png" width="64" height="64" alt="The Taste" style={{ borderRadius: 16, background: '#fff', objectFit: 'contain' }} />
          <h1 style={{ margin: '24px 0 6px', fontSize: 'clamp(2rem, 5vw, 3.5rem)', letterSpacing: '-0.04em' }}>The Taste</h1>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontWeight: 700 }}>Restaurant Operating System</p>
          <div style={{ display: 'grid', gap: 24, marginTop: 52, maxWidth: 520 }}>
            {featureRows.map(([icon, title, description]) => (
              <div key={title} style={{ display: 'grid', gridTemplateColumns: '44px 1fr', gap: 16, alignItems: 'start' }}>
                <span className="material-symbols-rounded" aria-hidden="true" style={{ color: 'var(--brand-orange-legacy)', fontSize: 26 }}>{icon}</span>
                <div>
                  <h2 style={{ margin: '0 0 4px', fontSize: 16 }}>{title}</h2>
                  <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.5, fontSize: 14 }}>{description}</p>
                </div>
              </div>
            ))}
          </div>
        </aside>

        <main style={{ display: 'grid', placeItems: 'center', padding: 24, minHeight: '100%' }}>
          <div style={{ width: 'min(100%, 420px)', border: '1px solid var(--border-color)', borderRadius: 24, background: 'var(--bg-card)', boxShadow: 'var(--shadow-xl)', padding: 'clamp(24px, 5vw, 40px)' }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={onClose} style={{ marginBottom: 28 }}>
              <span className="material-symbols-rounded" aria-hidden="true">home</span> Home
            </button>

            <h2 style={{ margin: '0 0 8px', color: 'var(--text-primary)' }}>Staff sign in</h2>
            <p style={{ margin: '0 0 28px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Use your organization email and password. Local PIN-only access is disabled for production security.
            </p>

            <form onSubmit={submit} noValidate>
              <label htmlFor="login-email" style={{ display: 'block', marginBottom: 8, fontWeight: 700 }}>Account email</label>
              <input
                id="login-email"
                className="input"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="username"
                required
                style={{ width: '100%', marginBottom: 20 }}
              />

              <label htmlFor="login-password" style={{ display: 'block', marginBottom: 8, fontWeight: 700 }}>Password</label>
              <input
                id="login-password"
                className="input"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
                style={{ width: '100%', marginBottom: 12 }}
              />

              <div role="alert" style={{ minHeight: 24, color: 'var(--color-danger)', fontSize: 13, marginBottom: 12 }}>
                {error}
              </div>

              <button type="submit" className="btn btn-primary" disabled={isSubmitting} style={{ width: '100%', minHeight: 46 }}>
                {isSubmitting ? 'Authenticating…' : 'Authorize access'}
              </button>
            </form>

            <button type="button" className="btn btn-secondary btn-sm" onClick={resetLocalSession} style={{ width: '100%', marginTop: 14 }}>
              Reset session and offline cache
            </button>
          </div>
        </main>
      </section>
      <style>{`@media (min-width: 800px) { .login-screen > section { grid-template-columns: minmax(360px, 45%) 1fr !important; } } @media (max-width: 799px) { .login-brand-panel { display: none !important; } }`}</style>
    </div>
  );
}

/**
 * Compatibility wrapper for the existing imperative application router.
 *
 * Two rules here are load-bearing, and breaking either one left every signed-in user staring at
 * "Failed to load staff console" instead of the POS:
 *
 * 1. React gets a container of its own, never `#app`. The success callback rebuilds `#app` from
 *    scratch; a React root unmounting from `#app` afterwards deletes the shell that was just
 *    built, and `#app-sidebar` is null by the time the sidebar module finishes loading.
 * 2. The unmount happens after the callback and off the current task. Unmounting synchronously
 *    from inside a React event handler tears down a root that is still rendering.
 */
export class LoginScreen {
  private root: Root | null = null;
  private host: HTMLElement | null = null;

  constructor(private readonly onLoginSuccess: LoginCallback, _options: Record<string, unknown> = {}) {}

  render(container: HTMLElement) {
    this.destroy();

    const host = document.createElement('div');
    host.className = 'login-root';
    container.appendChild(host);

    this.host = host;
    this.root = createRoot(host);
    this.root.render(
      <StaffLogin
        onClose={() => this.destroy()}
        onLoginSuccess={(staff) => {
          // Hand the root and its container over before calling out: the callback rebuilds the
          // page, and whatever it does must not be able to race this teardown.
          const root = this.root;
          const own = this.host;
          this.root = null;
          this.host = null;

          this.onLoginSuccess?.(staff);

          queueMicrotask(() => {
            // `own` may already be detached — the callback replaced `#app`'s contents. It still
            // holds React's own nodes, so this unmount is well-defined either way.
            try { root?.unmount(); } catch { /* already gone with the old shell */ }
            own?.remove();
          });
        }}
      />
    );
  }

  destroy() {
    const root = this.root;
    const own = this.host;
    this.root = null;
    this.host = null;
    try { root?.unmount(); } catch { /* container already replaced */ }
    own?.remove();
  }
}
