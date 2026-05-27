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
      await db.transaction('rw', db.staff, db.settings, async () => {
        await db.staff.add({
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
