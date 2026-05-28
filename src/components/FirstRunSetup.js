import { db, setSetting } from '../db/database.js';
import { hashPin } from '../utils/crypto.js';
import { showToast, playSound, vibrateDevice } from '../utils/helpers.js';

export class FirstRunSetup {
  constructor(onComplete) {
    this.onComplete = onComplete;
    this.container = null;
  }

  render(container) {
    this.container = container;
    container.innerHTML = `
      <div class="login-screen">
        <div class="login-card" style="max-width:420px;text-align:left;">
          <div style="text-align:center;">
            <div class="login-logo-container" style="display:flex;justify-content:center;margin-bottom:12px;">
              <img src="/assets/aether-icon.png" class="login-logo-img" alt="The Taste Logo" style="width:64px;height:64px;border-radius:var(--radius-md);border:1px solid var(--border-active);box-shadow:var(--shadow-glow-active);" />
            </div>
            <h1 class="login-title">The Taste</h1>
            <p class="login-subtitle">Owner setup required</p>
          </div>

          <div style="display:flex;flex-direction:column;gap:14px;">
            <label class="login-label" for="setup-restaurant">Restaurant name</label>
            <input id="setup-restaurant" class="input" value="The Taste" maxlength="80" style="${this.inputStyle()}">

            <label class="login-label" for="setup-owner">Owner name</label>
            <input id="setup-owner" class="input" value="Owner" maxlength="80" style="${this.inputStyle()}">

            <label class="login-label" for="setup-pin">New owner PIN</label>
            <input id="setup-pin" class="input" type="password" inputmode="numeric" maxlength="4" placeholder="4 digits" style="${this.inputStyle('letter-spacing:0.4em;text-align:center;font-weight:800;')}">

            <label class="login-label" for="setup-confirm-pin">Confirm PIN</label>
            <input id="setup-confirm-pin" class="input" type="password" inputmode="numeric" maxlength="4" placeholder="Repeat PIN" style="${this.inputStyle('letter-spacing:0.4em;text-align:center;font-weight:800;')}">

            <button class="btn btn-primary btn-block btn-lg" id="setup-submit" style="margin-top:8px;font-family:'Plus Jakarta Sans',sans-serif;font-weight:800;">
              Create Secure Owner
            </button>
          </div>

          <p style="font-size:0.7rem;color:rgba(148,163,184,0.68);line-height:1.5;margin:18px 0 0;text-align:center;">
            This device has no owner account yet. The old default PIN is disabled for production setup.
          </p>
        </div>
      </div>

      <style>
        .login-screen {
          position: fixed; inset: 0; z-index: 9998;
          display: flex; align-items: center; justify-content: center;
          background: radial-gradient(circle at center, #12121C 0%, #08080C 100%);
          overflow: hidden;
        }
        .login-card {
          width: 90%; max-width: 420px; text-align: left;
          padding: 48px 32px 32px;
          background: var(--glass-bg);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-xl);
          backdrop-filter: var(--glass-backdrop-filter);
          -webkit-backdrop-filter: var(--glass-backdrop-filter);
          box-shadow: var(--shadow-xl), 0 0 100px rgba(139, 92, 246, 0.03);
          animation: loginSlideUp var(--transition-slow) var(--ease-out-expo);
        }
        @keyframes loginSlideUp {
          from { opacity: 0; transform: translateY(30px) scale(0.96); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .login-logo-container {
          display: flex;
          justify-content: center;
          align-items: center;
          margin-bottom: 16px;
        }
        .login-logo-img {
          width: 72px;
          height: 72px;
          object-fit: contain;
          border-radius: var(--radius-md);
          border: 1px solid var(--border-active);
          box-shadow: var(--shadow-glow-active), 0 4px 12px rgba(0, 0, 0, 0.15);
          transition: transform var(--transition-fast) var(--ease-spring);
        }
        .login-logo-img:hover {
          transform: scale(1.1) rotate(3deg);
        }
        .login-title {
          font-family: var(--font-display);
          font-size: 1.75rem; font-weight: 800;
          background: var(--gradient-primary);
          -webkit-background-clip: text; -webkit-text-fill-color: transparent;
          background-clip: text; margin: 0 0 6px; letter-spacing: -0.04em;
        }
        .login-subtitle {
          font-size: 0.72rem; color: var(--text-secondary);
          letter-spacing: 0.08em; text-transform: uppercase;
          font-weight: 700; margin: 0 0 24px;
          opacity: 0.8;
        }
        .login-label {
          font-size: 0.68rem; color: var(--text-muted);
          font-weight: 700; letter-spacing: 0.08em;
          text-transform: uppercase; display: block; margin-bottom: 8px;
        }
        @media (max-width: 480px) {
          .login-card {
            padding: 32px 20px 24px;
            border-radius: var(--radius-lg);
          }
          .login-title {
            font-size: 1.5rem;
          }
          .login-logo-img {
            width: 56px;
            height: 56px;
            margin-bottom: 8px;
          }
        }
      </style>
    `;

    container.querySelector('#setup-submit')?.addEventListener('click', () => this.submit());
    container.querySelectorAll('input').forEach(input => {
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') this.submit();
      });
    });
  }

  inputStyle(extra = '') {
    return `
      background:rgba(0,0,0,0.25);
      border:1px solid rgba(255,255,255,0.08);
      color:var(--text-primary);
      font-family:'Inter',sans-serif;
      font-size:var(--text-sm);
      padding:12px 14px;
      border-radius:10px;
      width:100%;
      box-sizing:border-box;
      outline:none;
      ${extra}
    `;
  }

  async submit() {
    const restaurantName = this.container.querySelector('#setup-restaurant')?.value.trim();
    const ownerName = this.container.querySelector('#setup-owner')?.value.trim();
    const pin = this.container.querySelector('#setup-pin')?.value.trim();
    const confirmPin = this.container.querySelector('#setup-confirm-pin')?.value.trim();

    if (!restaurantName) {
      showToast('Restaurant name is required', 'warning');
      return;
    }
    if (!ownerName) {
      showToast('Owner name is required', 'warning');
      return;
    }
    if (!/^\d{4}$/.test(pin || '')) {
      showToast('Owner PIN must be exactly 4 digits', 'warning');
      return;
    }
    if (pin === '1234') {
      showToast('Choose a private PIN. 1234 is not allowed for launch.', 'warning');
      return;
    }
    if (pin !== confirmPin) {
      showToast('PIN confirmation does not match', 'warning');
      return;
    }

    try {
      const pinHash = await hashPin(pin);
      let newOwnerId = null;
      await db.transaction('rw', db.staff, db.settings, async () => {
        newOwnerId = await db.staff.add({
          name: ownerName,
          role: 'owner',
          pinHash,
          isActive: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          isSynced: 0,
          _platform: 'nextgenos'
        });
        await setSetting('restaurantName', restaurantName);
        await setSetting('adminPinHash', pinHash);
        await setSetting('ownerSetupComplete', 'true');
      });

      if (newOwnerId) {
        localStorage.setItem(`pin_authorized_${newOwnerId}`, 'true');
        localStorage.setItem('auth_staff_pin', pinHash);
      }

      // ── Immediately push owner to Supabase cloud ──────────────────
      // This is critical for multi-device consistency: other devices need
      // to find this owner in the cloud to avoid creating their own.
      if (navigator.onLine && newOwnerId) {
        try {
          const ownerRecord = await db.staff.get(newOwnerId);
          if (ownerRecord) {
            // Try staff-admin edge function first (works with anon role)
            try {
              const { syncStaffViaAdminFunction } = await import('../services/staffAdmin.js');
              const result = await syncStaffViaAdminFunction(ownerRecord);
              if (result.success) {
                await db.staff.update(newOwnerId, { isSynced: 1 });
                console.log('[FirstRunSetup] Owner synced to cloud via edge function.');
              } else {
                console.warn('[FirstRunSetup] Edge function sync failed:', result.message);
                // Fall through to direct upsert below
              }
            } catch (edgeFnErr) {
              console.warn('[FirstRunSetup] Edge function unavailable:', edgeFnErr.message);
            }

            // Fallback: direct upsert (works if RLS allows it or user is authenticated)
            if (!(await db.staff.get(newOwnerId))?.isSynced) {
              try {
                const { getSupabaseClient } = await import('../services/supabaseClient.js');
                const client = await getSupabaseClient({ persistSession: true });
                if (client) {
                  const storeId = localStorage.getItem('store_id') || 'the-taste';
                  const { error } = await client.from('staff').upsert({
                    id: ownerRecord.id,
                    store_id: storeId,
                    name: ownerRecord.name,
                    role: ownerRecord.role,
                    pin_hash: ownerRecord.pinHash,
                    is_active: true,
                    created_at: ownerRecord.createdAt,
                    updated_at: ownerRecord.updatedAt
                  });
                  if (!error) {
                    await db.staff.update(newOwnerId, { isSynced: 1 });
                    console.log('[FirstRunSetup] Owner synced to cloud via direct upsert.');
                  } else {
                    console.warn('[FirstRunSetup] Direct upsert failed (RLS):', error.message);
                  }
                }
              } catch (directErr) {
                console.warn('[FirstRunSetup] Direct cloud sync failed:', directErr.message);
              }
            }
          }
        } catch (syncErr) {
          console.warn('[FirstRunSetup] Cloud sync attempt failed (will retry on next sync):', syncErr.message);
        }
      }

      playSound(900, 100);
      vibrateDevice([40, 20, 40]);
      showToast('Owner setup complete. Please log in with your new PIN.', 'success');
      if (this.onComplete) await this.onComplete();
    } catch (error) {
      console.error('[FirstRunSetup] Failed to create owner:', error);
      showToast('Setup failed: ' + error.message, 'error');
    }
  }
}
