/**
 * ═══════════════════════════════════════════════════
 *  NextGenOS Restaurant Operating System
 *  Component: Login Screen
 *  Version: 2.0.0
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

          <div class="login-pin-section">
            <label class="login-label">Enter Staff PIN</label>
            <div class="login-pin-dots" id="login-pin-dots">
              <span class="pin-dot"></span>
              <span class="pin-dot"></span>
              <span class="pin-dot"></span>
              <span class="pin-dot"></span>
            </div>
            <div id="login-error" class="login-error"></div>
          </div>

          <div class="login-numpad" id="login-numpad">
            ${[1,2,3,4,5,6,7,8,9,'',0,'⌫'].map(k => k === '' ? '<button class="numpad-btn empty" disabled></button>' : `
              <button class="numpad-btn ${k === '⌫' ? 'backspace' : ''}" data-key="${k}">
                ${k === '⌫' ? '<span class="material-symbols-rounded" style="font-size:20px;">backspace</span>' : k}
              </button>
            `).join('')}
          </div>

          <div class="login-footer">
            <span style="color:rgba(108,92,231,0.4);font-size:8px;">◆</span>
            <span style="font-size:0.5rem;color:rgba(148,163,184,0.3);letter-spacing:0.06em;">Powered by</span>
            <span style="font-size:0.5rem;color:rgba(108,92,231,0.4);letter-spacing:0.06em;">NextGenOS</span>
          </div>
        </div>
      </div>

      <style>
        .login-screen {
          position: fixed; inset: 0; z-index: 9998;
          display: flex; align-items: center; justify-content: center;
          background: linear-gradient(135deg, #0F0F1A 0%, #1A1A2E 50%, #0F0F1A 100%);
        }
        .login-card {
          width: 90%; max-width: 340px; text-align: center;
          padding: 40px 28px 28px;
          background: rgba(17, 17, 30, 0.8);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 24px;
          backdrop-filter: blur(40px);
          box-shadow: 0 24px 48px rgba(0,0,0,0.5);
          animation: loginSlideUp 0.5s cubic-bezier(0.16, 1, 0.3, 1);
        }
        @keyframes loginSlideUp {
          from { opacity: 0; transform: translateY(30px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .login-logo {
          font-size: 2.5rem; margin-bottom: 8px;
          filter: drop-shadow(0 4px 12px rgba(255,107,53,0.3));
        }
        .login-title {
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-size: 1.5rem; font-weight: 800;
          background: linear-gradient(135deg, #FF6B35, #FFB347);
          -webkit-background-clip: text; -webkit-text-fill-color: transparent;
          background-clip: text; margin: 0 0 4px; letter-spacing: -0.03em;
        }
        .login-subtitle {
          font-size: 0.7rem; color: rgba(148,163,184,0.5);
          letter-spacing: 0.08em; text-transform: uppercase;
          font-weight: 600; margin: 0 0 28px;
        }
        .login-pin-section { margin-bottom: 24px; }
        .login-label {
          font-size: 0.7rem; color: rgba(148,163,184,0.6);
          font-weight: 600; letter-spacing: 0.06em;
          text-transform: uppercase; display: block; margin-bottom: 14px;
        }
        .login-pin-dots {
          display: flex; gap: 14px; justify-content: center; margin-bottom: 10px;
        }
        .pin-dot {
          width: 14px; height: 14px; border-radius: 50%;
          border: 2px solid rgba(255,255,255,0.12);
          transition: all 0.2s ease;
        }
        .pin-dot.filled {
          background: #FF6B35;
          border-color: #FF6B35;
          box-shadow: 0 0 10px rgba(255,107,53,0.4);
        }
        .pin-dot.error {
          border-color: #EF4444;
          animation: shake 0.4s ease;
        }
        @keyframes shake {
          0%,100% { transform: translateX(0); }
          25% { transform: translateX(-6px); }
          75% { transform: translateX(6px); }
        }
        .login-error {
          font-size: 0.7rem; color: #EF4444; font-weight: 600;
          min-height: 18px; margin-top: 6px;
        }
        .login-numpad {
          display: grid; grid-template-columns: repeat(3, 1fr);
          gap: 10px; max-width: 240px; margin: 0 auto 20px;
        }
        .numpad-btn {
          height: 52px; border-radius: 14px; border: 1px solid rgba(255,255,255,0.06);
          background: rgba(255,255,255,0.02); color: white;
          font-size: 1.2rem; font-weight: 700; cursor: pointer;
          font-family: 'Plus Jakarta Sans', sans-serif;
          transition: all 0.15s ease; display: flex;
          align-items: center; justify-content: center;
        }
        .numpad-btn:hover:not(:disabled) {
          background: rgba(255,255,255,0.06);
          border-color: rgba(255,255,255,0.12);
          transform: scale(1.05);
        }
        .numpad-btn:active:not(:disabled) {
          transform: scale(0.95);
          background: rgba(255,107,53,0.1);
        }
        .numpad-btn.empty { visibility: hidden; }
        .numpad-btn.backspace { color: rgba(148,163,184,0.6); }
        .login-footer {
          display: flex; align-items: center; justify-content: center;
          gap: 4px; padding-top: 8px; opacity: 0.6;
        }
      </style>
    `;

    this.bindEvents();
  }

  bindEvents() {
    const numpad = document.getElementById('login-numpad');
    if (!numpad) return;

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

    // Keyboard support
    this._keyHandler = (e) => {
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

  async attemptLogin() {
    try {
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
        if (errEl) errEl.textContent = 'Invalid PIN. Try again.';
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
