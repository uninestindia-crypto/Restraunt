/**
 * ═══════════════════════════════════════════════════
 *  NextGenOS Restaurant Operating System
 *  Component: Enterprise Login Screen
 *  Version: 3.0.0
 *  © 2026 NextGenOS. All Rights Reserved.
 *  This software is proprietary and confidential.
 * ═══════════════════════════════════════════════════
 */

import { authService } from '../services/auth.js';
import { showToast, playSound, vibrateDevice } from '../utils/helpers.js';

export class LoginScreen {
  constructor(onLoginSuccess) {
    this.onLoginSuccess = onLoginSuccess;
    this.container = null;
    this.pinInput = '';
    this._keyHandler = null;
  }

  render(container) {
    this.container = container;
    this.pinInput = '';

    container.innerHTML = `
      <div class="login-screen">
        <div class="login-card">
          <div class="login-logo">🍜</div>
          <h1 class="login-title">The Taste</h1>
          <p class="login-subtitle">Restaurant Operating System</p>

          <div class="login-tabs">
            <button class="login-tab-btn active" id="tab-cloud" type="button">Enterprise Cloud</button>
            <button class="login-tab-btn" id="tab-pin" type="button">Local PIN</button>
          </div>

          <div id="login-error" class="login-error"></div>

          <!-- Enterprise Cloud Sign-In Form -->
          <div class="login-section" id="section-cloud" style="display: block;">
            <div class="login-input-group">
              <label class="login-label" for="login-email">Staff Email</label>
              <input type="email" id="login-email" class="login-input" placeholder="name@nextgenos.com" required autocomplete="username">
            </div>
            <div class="login-input-group">
              <label class="login-label" for="login-password">Security Password</label>
              <input type="password" id="login-password" class="login-input" placeholder="••••••••••••" required autocomplete="current-password">
            </div>
            <button class="btn btn-primary login-submit-btn" id="btn-cloud-login" type="button" style="width:100%; height:46px; border-radius:var(--radius-sm); font-weight:700; margin-top:8px;">
              Authorize Access
            </button>
          </div>

          <!-- Local PIN Sign-In Form -->
          <div class="login-section" id="section-pin" style="display: none;">
            <div class="login-pin-section">
              <label class="login-label">Enter Staff PIN</label>
              <div class="login-pin-dots" id="login-pin-dots">
                <span class="pin-dot"></span>
                <span class="pin-dot"></span>
                <span class="pin-dot"></span>
                <span class="pin-dot"></span>
              </div>
            </div>

            <div class="login-numpad" id="login-numpad">
              ${[1,2,3,4,5,6,7,8,9,'',0,'⌫'].map(k => k === '' ? '<button class="numpad-btn empty" disabled></button>' : `
                <button class="numpad-btn ${k === '⌫' ? 'backspace' : ''}" data-key="${k}" type="button">
                  ${k === '⌫' ? '<span class="material-symbols-rounded" style="font-size:20px;">backspace</span>' : k}
                </button>
              `).join('')}
            </div>
          </div>

          <div class="login-footer">
            <span style="color:rgba(139,92,246,0.4);font-size:8px;">◆</span>
            <span style="font-size:0.5rem;color:var(--text-secondary);opacity:0.4;letter-spacing:0.06em;">Powered by</span>
            <span style="font-size:0.5rem;color:rgba(139,92,246,0.5);letter-spacing:0.06em;font-weight:700;">NextGenOS</span>
          </div>
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
          width: 90%; max-width: 350px; text-align: center;
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
        .login-logo {
          font-size: 2.8rem; margin-bottom: 12px;
          filter: drop-shadow(0 6px 16px var(--color-primary-glow));
          transition: transform var(--transition-fast) var(--ease-spring);
        }
        .login-logo:hover {
          transform: scale(1.1);
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
        .login-tabs {
          display: flex; gap: 8px; margin-bottom: 24px;
          background: rgba(255, 255, 255, 0.015);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-md);
          padding: 4px;
        }
        .login-tab-btn {
          flex: 1; padding: 8px; font-size: 0.72rem; font-weight: 700;
          border-radius: var(--radius-sm); color: var(--text-secondary);
          transition: all var(--transition-fast);
          cursor: pointer;
          border: none;
          background: none;
        }
        .login-tab-btn.active {
          background: var(--color-primary);
          color: #FFFFFF;
          box-shadow: var(--shadow-sm);
        }
        .login-input-group {
          margin-bottom: 16px;
          text-align: left;
        }
        .login-label {
          font-size: 0.68rem; color: var(--text-muted);
          font-weight: 700; letter-spacing: 0.08em;
          text-transform: uppercase; display: block; margin-bottom: 8px;
        }
        .login-input {
          width: 100%; height: 46px; background: var(--bg-input);
          border: 1px solid var(--border-color); border-radius: var(--radius-sm);
          padding: 0 16px; color: var(--text-primary); font-size: var(--text-base);
          transition: all var(--transition-fast) var(--ease-out-expo);
        }
        .login-input:focus {
          border-color: var(--color-primary);
          box-shadow: var(--shadow-primary);
          outline: none;
        }
        .login-pin-section { margin-bottom: 28px; }
        .login-pin-dots {
          display: flex; gap: 16px; justify-content: center; margin-bottom: 12px;
          margin-top: 12px;
        }
        .pin-dot {
          width: 12px; height: 12px; border-radius: 50%;
          border: 2px solid var(--border-active);
          background: transparent;
          transition: all var(--transition-fast) var(--ease-out-expo);
        }
        .pin-dot.filled {
          background: var(--color-primary);
          border-color: var(--color-primary);
          box-shadow: var(--shadow-primary);
          transform: scale(1.15);
        }
        .pin-dot.error {
          border-color: var(--color-danger);
          background: var(--color-danger);
          box-shadow: 0 0 12px rgba(239, 68, 68, 0.4);
          animation: shake 0.4s var(--ease-spring);
        }
        @keyframes shake {
          0%,100% { transform: translateX(0); }
          25% { transform: translateX(-6px); }
          75% { transform: translateX(6px); }
        }
        .login-error {
          font-size: 0.72rem; color: var(--color-danger); font-weight: 600;
          min-height: 18px; margin-bottom: 12px;
          letter-spacing: -0.01em;
        }
        .login-numpad {
          display: grid; grid-template-columns: repeat(3, 1fr);
          gap: 12px; max-width: 250px; margin: 0 auto 24px;
        }
        .numpad-btn {
          height: 56px; border-radius: var(--radius-md); border: 1px solid var(--border-color);
          background: var(--bg-card); color: var(--text-primary);
          font-size: 1.3rem; font-weight: 700; cursor: pointer;
          font-family: var(--font-sans);
          transition: all var(--transition-fast) var(--ease-out-expo), transform var(--transition-fast) var(--ease-spring);
          display: flex; align-items: center; justify-content: center;
          box-shadow: var(--shadow-sm);
        }
        .numpad-btn:hover:not(:disabled) {
          background: var(--bg-card-hover);
          border-color: var(--border-active);
          transform: translateY(-2px);
          box-shadow: var(--shadow-md);
        }
        .numpad-btn:active:not(:disabled) {
          transform: scale(0.93) translateY(0);
          background: rgba(var(--color-primary-rgb), 0.08);
          border-color: var(--border-active);
        }
        .numpad-btn.empty { visibility: hidden; }
        .numpad-btn.backspace { color: var(--text-secondary); }
        .login-footer {
          display: flex; align-items: center; justify-content: center;
          gap: 6px; padding-top: 12px; border-top: 1px solid var(--border-color);
        }
      </style>
    `;

    this.bindEvents();
  }

  bindEvents() {
    const tabCloud = document.getElementById('tab-cloud');
    const tabPin = document.getElementById('tab-pin');
    const secCloud = document.getElementById('section-cloud');
    const secPin = document.getElementById('section-pin');
    const btnCloud = document.getElementById('btn-cloud-login');
    const errEl = document.getElementById('login-error');

    tabCloud?.addEventListener('click', () => {
      tabCloud.classList.add('active');
      tabPin.classList.remove('active');
      if (secCloud) secCloud.style.display = 'block';
      if (secPin) secPin.style.display = 'none';
      if (errEl) errEl.textContent = '';
      playSound(650, 60);
    });

    tabPin?.addEventListener('click', () => {
      tabPin.classList.add('active');
      tabCloud.classList.remove('active');
      if (secPin) secPin.style.display = 'block';
      if (secCloud) secCloud.style.display = 'none';
      if (errEl) errEl.textContent = '';
      playSound(650, 60);
    });

    btnCloud?.addEventListener('click', () => this.attemptCloudLogin());

    const numpad = document.getElementById('login-numpad');
    if (numpad) {
      numpad.querySelectorAll('.numpad-btn:not(.empty)').forEach(btn => {
        btn.addEventListener('click', () => {
          const key = btn.dataset.key;
          if (key === '⌫') {
            this.pinInput = this.pinInput.slice(0, -1);
            playSound(400, 50);
          } else if (this.pinInput.length < 4) {
            this.pinInput += key;
            playSound(600, 50);
          }
          this.updateDots();
          if (this.pinInput.length === 4) {
            setTimeout(() => this.attemptLogin(), 200);
          }
        });
      });
    }

    // Keyboard support
    this._keyHandler = (e) => {
      // Only process keys on local pin mode when active
      if (secPin && secPin.style.display === 'block') {
        if (e.key >= '0' && e.key <= '9' && this.pinInput.length < 4) {
          this.pinInput += e.key;
          playSound(600, 50);
          this.updateDots();
          if (this.pinInput.length === 4) setTimeout(() => this.attemptLogin(), 200);
        } else if (e.key === 'Backspace') {
          this.pinInput = this.pinInput.slice(0, -1);
          playSound(400, 50);
          this.updateDots();
        }
      } else if (secCloud && secCloud.style.display === 'block' && e.key === 'Enter') {
        this.attemptCloudLogin();
      }
    };
    document.addEventListener('keydown', this._keyHandler);
  }

  updateDots() {
    const dots = document.querySelectorAll('#login-pin-dots .pin-dot');
    dots.forEach((dot, i) => {
      dot.classList.toggle('filled', i < this.pinInput.length);
      dot.classList.remove('error');
    });
    const errEl = document.getElementById('login-error');
    if (errEl) errEl.textContent = '';
  }

  async attemptCloudLogin() {
    const emailEl = document.getElementById('login-email');
    const passwordEl = document.getElementById('login-password');
    const errEl = document.getElementById('login-error');
    const btnCloud = document.getElementById('btn-cloud-login');

    const email = emailEl?.value.trim();
    const password = passwordEl?.value;

    if (!email || !password) {
      showToast('Email and password are required', 'warning');
      return;
    }

    try {
      if (errEl) errEl.textContent = '';
      if (btnCloud) {
        btnCloud.disabled = true;
        btnCloud.textContent = 'Authenticating...';
      }

      const staff = await authService.loginWithCloudCredentials(email, password);
      if (staff) {
        playSound(900, 100);
        vibrateDevice([40, 20, 40]);
        showToast(`Welcome, ${staff.name}! (${staff.role})`, 'success');
        this.destroy();
        if (this.onLoginSuccess) this.onLoginSuccess(staff);
      } else {
        throw new Error('Could not resolve staff member.');
      }
    } catch (err) {
      playSound(200, 200);
      vibrateDevice([100]);
      if (errEl) errEl.textContent = err.message || 'Invalid email or password.';
      if (btnCloud) {
        btnCloud.disabled = false;
        btnCloud.textContent = 'Authorize Access';
      }
    }
  }

  async attemptLogin() {
    try {
      const lockoutRemaining = authService.getLockoutRemaining();
      if (lockoutRemaining > 0) {
        const seconds = Math.ceil(lockoutRemaining / 1000);
        const errEl = document.getElementById('login-error');
        if (errEl) errEl.textContent = `Too many attempts. Try again in ${seconds}s.`;
        this.pinInput = '';
        this.updateDots();
        return;
      }

      const staff = await authService.login(this.pinInput);
      if (staff) {
        playSound(900, 100);
        vibrateDevice([40, 20, 40]);
        showToast(`Welcome, ${staff.name}!`, 'success');
        this.destroy();
        if (this.onLoginSuccess) this.onLoginSuccess(staff);
      } else {
        playSound(200, 200);
        vibrateDevice([100]);
        const dots = document.querySelectorAll('#login-pin-dots .pin-dot');
        dots.forEach(d => d.classList.add('error'));
        const errEl = document.getElementById('login-error');
        const remaining = authService.getLockoutRemaining();
        if (errEl) {
          errEl.textContent = remaining > 0
            ? `Too many attempts. Try again in ${Math.ceil(remaining / 1000)}s.`
            : 'Invalid PIN. Try again.';
        }
        this.pinInput = '';
        setTimeout(() => this.updateDots(), 800);
      }
    } catch (err) {
      console.error('Login error:', err);
      showToast('Login failed', 'error');
      this.pinInput = '';
      this.updateDots();
    }
  }

  destroy() {
    if (this._keyHandler) {
      document.removeEventListener('keydown', this._keyHandler);
    }
    if (this.container) {
      const screen = this.container.querySelector('.login-screen');
      if (screen) screen.remove();
      const style = this.container.querySelector('style');
      if (style) style.remove();
    }
  }
}
