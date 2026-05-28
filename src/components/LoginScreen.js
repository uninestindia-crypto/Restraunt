/**
 * ═══════════════════════════════════════════════════
 *  NextGenOS Restaurant Operating System
 *  Component: Unified Enterprise Login & Signup Screen
 *  Version: 4.0.0
 *  © 2026 NextGenOS. All Rights Reserved.
 *  This software is proprietary and confidential.
 * ═══════════════════════════════════════════════════
 */

import { authService } from '../services/auth.js';
import { signUpCustomer } from '../services/supabaseClient.js';
import { showToast, playSound, vibrateDevice } from '../utils/helpers.js';

export class LoginScreen {
  constructor(onLoginSuccess) {
     container.innerHTML = `
      <div class="login-screen">
        <div class="login-split-container">
          
          <!-- Left side: Premium Branding Panel (visible on desktop) -->
          <div class="login-brand-panel">
            <div class="login-brand-content">
              <div class="login-brand-logo-wrapper">
                <img src="/assets/aether-icon.png" class="brand-panel-logo" alt="The Taste Logo" />
              </div>
              <h2 class="brand-panel-title">The Taste</h2>
              <p class="brand-panel-tagline">Restaurant Operating System</p>
              
              <div class="brand-features-list">
                <div class="brand-feature-item">
                  <span class="material-symbols-rounded feature-icon">sync</span>
                  <div class="feature-text">
                    <h4 class="feature-title">Real-Time Sync</h4>
                    <p class="feature-desc">Instant table status and order updates across all staff devices.</p>
                  </div>
                </div>
                <div class="brand-feature-item">
                  <span class="material-symbols-rounded feature-icon">wifi_off</span>
                  <div class="feature-text">
                    <h4 class="feature-title">Offline Resilience</h4>
                    <p class="feature-desc">Continuous operation even during internet outages, syncing automatically later.</p>
                  </div>
                </div>
                <div class="brand-feature-item">
                  <span class="material-symbols-rounded feature-icon">monitoring</span>
                  <div class="feature-text">
                    <h4 class="feature-title">Enterprise Analytics</h4>
                    <p class="feature-desc">Detailed reports, item sales history, and customer behavior insights.</p>
                  </div>
                </div>
                <div class="brand-feature-item">
                  <span class="material-symbols-rounded feature-icon">print</span>
                  <div class="feature-text">
                    <h4 class="feature-title">Thermal Invoicing</h4>
                    <p class="feature-desc">Wireless Bluetooth and ESC/POS printer support for instant customer bills.</p>
                  </div>
                </div>
              </div>
            </div>
            
            <div class="brand-panel-footer">
              <span>Enterprise Cloud Edition</span>
              <span class="brand-version">v4.0.0</span>
            </div>
          </div>
          
          <!-- Right side: Authentication Form Panel -->
          <div class="login-form-panel">
            <div class="login-card">
              <!-- Home Navigation Button -->
              <div class="login-home-btn-container">
                <button id="login-home-btn" class="btn btn-secondary btn-sm home-nav-btn">
                  <span class="material-symbols-rounded" style="font-size: 16px;">home</span>
                  Home
                </button>
              </div>
              
              <div class="login-header-mobile">
                <div class="login-logo-container" id="login-logo-btn">
                  <img src="/assets/aether-icon.png" class="login-logo-img" alt="The Taste Logo" />
                </div>
                <h1 class="login-title" id="login-brand-title">The Taste</h1>
                <p class="login-subtitle">Restaurant Operating System</p>
              </div>
              
              <div class="login-tabs" id="login-tabs-container">
                <button class="login-tab-btn active" id="tab-cloud" type="button">Enterprise Cloud</button>
                <button class="login-tab-btn" id="tab-pin" type="button">Local PIN</button>
              </div>

              <div id="login-error" class="login-error"></div>

              <!-- Cloud Sign-In Form -->
              <div class="login-section" id="section-cloud" style="display: block;">
                <div class="login-input-group">
                  <label class="login-label" for="login-email">Account Email</label>
                  <div class="input-with-icon">
                    <span class="material-symbols-rounded input-icon">mail</span>
                    <input type="email" id="login-email" class="login-input" placeholder="name@nextgenos.com" required autocomplete="username">
                  </div>
                </div>
                <div class="login-input-group">
                  <label class="login-label" for="login-password">Security Password</label>
                  <div class="input-with-icon">
                    <span class="material-symbols-rounded input-icon">lock</span>
                    <input type="password" id="login-password" class="login-input" placeholder="••••••••••••" required autocomplete="current-password">
                  </div>
                </div>
                <button class="btn btn-primary login-submit-btn" id="btn-cloud-login" type="button">
                  Authorize Access
                </button>
                <p class="login-toggle-link" id="link-goto-signup">New to The Taste? Create Customer Account</p>
              </div>

              <!-- Customer Sign-Up Form -->
              <div class="login-section" id="section-signup" style="display: none;">
                <div class="login-input-group">
                  <label class="login-label" for="signup-name">Full Name</label>
                  <div class="input-with-icon">
                    <span class="material-symbols-rounded input-icon">person</span>
                    <input type="text" id="signup-name" class="login-input" placeholder="Aarav Sharma" required autocomplete="name">
                  </div>
                </div>
                <div class="login-input-group">
                  <label class="login-label" for="signup-email">Email Address</label>
                  <div class="input-with-icon">
                    <span class="material-symbols-rounded input-icon">mail</span>
                    <input type="email" id="signup-email" class="login-input" placeholder="aarav@gmail.com" required autocomplete="username">
                  </div>
                </div>
                <div class="login-input-group">
                  <label class="login-label" for="signup-password">Password</label>
                  <div class="input-with-icon">
                    <span class="material-symbols-rounded input-icon">lock</span>
                    <input type="password" id="signup-password" class="login-input" placeholder="Minimum 6 characters" required autocomplete="new-password">
                  </div>
                </div>
                <button class="btn btn-primary login-submit-btn" id="btn-submit-signup" type="button">
                  Register & Order
                </button>
                <p class="login-toggle-link" id="link-goto-signin">Already have an account? Sign In</p>
              </div>

              <!-- Local PIN Sign-In Form (Staff Backup) -->
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
                      ${k === '⌫' ? '<span class="material-symbols-rounded" style="font-size:22px;">backspace</span>' : k}
                    </button>
                  `).join('')}
                </div>
              </div>

              <div class="login-footer">
                <span class="footer-dot">◆</span>
                <span class="footer-powered">Powered by</span>
                <span class="footer-brand">NextGenOS</span>
              </div>
            </div>
          </div>
          
        </div>
      </div>

      <style>
        .login-screen {
          position: fixed; inset: 0; z-index: 9998;
          display: flex;
          background: var(--bg-primary);
          overflow: hidden;
          font-family: var(--font-sans);
        }
        .login-split-container {
          display: flex;
          width: 100%;
          height: 100%;
        }
        
        /* ── Branding Panel (Left Column) ── */
        .login-brand-panel {
          display: none;
        }
        
        @media (min-width: 768px) {
          .login-brand-panel {
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            width: 45%;
            padding: 56px 48px;
            background: linear-gradient(135deg, #0F172A 0%, #020617 100%);
            color: #FFFFFF;
            position: relative;
            overflow: hidden;
            border-right: 1px solid var(--border-color);
          }
          
          /* Ambient floating orbs */
          .login-brand-panel::before {
            content: '';
            position: absolute;
            width: 500px;
            height: 500px;
            background: radial-gradient(circle, rgba(255, 94, 54, 0.15) 0%, transparent 70%);
            top: -150px;
            left: -150px;
            animation: floatGlow 15s infinite alternate ease-in-out;
            pointer-events: none;
          }
          
          .login-brand-panel::after {
            content: '';
            position: absolute;
            width: 400px;
            height: 400px;
            background: radial-gradient(circle, rgba(139, 92, 246, 0.12) 0%, transparent 70%);
            bottom: -100px;
            right: -100px;
            animation: floatGlow 20s infinite alternate-reverse ease-in-out;
            pointer-events: none;
          }
        }
        
        @keyframes floatGlow {
          0% { transform: translate(0, 0) scale(1); }
          100% { transform: translate(50px, 40px) scale(1.1); }
        }
        
        .login-brand-content {
          position: relative;
          z-index: 2;
          display: flex;
          flex-direction: column;
          flex: 1;
        }
        .login-brand-logo-wrapper {
          display: flex;
          align-items: center;
          margin-bottom: 24px;
        }
        .brand-panel-logo {
          width: 56px;
          height: 56px;
          object-fit: contain;
          border-radius: var(--radius-md);
          border: 1px solid rgba(255, 255, 255, 0.1);
          box-shadow: 0 8px 32px rgba(255, 94, 54, 0.25);
          transition: transform var(--transition-normal) var(--ease-spring);
        }
        .brand-panel-logo:hover {
          transform: scale(1.1) rotate(3deg);
        }
        .brand-panel-title {
          font-family: var(--font-display);
          font-size: 2.25rem;
          font-weight: 800;
          background: linear-gradient(135deg, #FFFFFF 0%, #E2E8F0 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          margin: 0 0 4px;
          letter-spacing: -0.04em;
        }
        .brand-panel-tagline {
          font-size: 0.8rem;
          color: #94A3B8;
          text-transform: uppercase;
          font-weight: 700;
          letter-spacing: 0.08em;
          margin: 0 0 48px;
          opacity: 0.9;
        }
        
        .brand-features-list {
          display: flex;
          flex-direction: column;
          gap: 28px;
          max-width: 380px;
        }
        .brand-feature-item {
          display: flex;
          gap: 20px;
          align-items: flex-start;
        }
        .feature-icon {
          color: var(--color-primary);
          background: rgba(255, 94, 54, 0.1);
          padding: 10px;
          border-radius: var(--radius-md);
          font-size: 20px;
          flex-shrink: 0;
          border: 1px solid rgba(255, 94, 54, 0.18);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .feature-text {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .feature-title {
          font-size: 0.95rem;
          font-weight: 700;
          color: #FFFFFF;
        }
        .feature-desc {
          font-size: 0.8125rem;
          color: #94A3B8;
          line-height: 1.45;
        }
        
        .brand-panel-footer {
          position: relative;
          z-index: 2;
          display: flex;
          justify-content: space-between;
          font-size: 0.72rem;
          color: #64748B;
          border-top: 1px solid rgba(255, 255, 255, 0.05);
          padding-top: 16px;
          margin-top: 24px;
        }
        
        /* ── Form Panel (Right Column) ── */
        .login-form-panel {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          background: var(--bg-primary);
          overflow-y: auto;
        }
        
        .login-card {
          width: 100%;
          max-width: 380px;
          padding: 40px 32px;
          background: var(--glass-bg);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-xl);
          backdrop-filter: var(--glass-backdrop-filter);
          -webkit-backdrop-filter: var(--glass-backdrop-filter);
          box-shadow: var(--shadow-xl);
          position: relative;
          animation: loginSlideUp var(--transition-normal) ease;
        }
        
        @keyframes loginSlideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        
        .login-home-btn-container {
          display: flex;
          justify-content: flex-start;
          margin-bottom: 24px;
        }
        .home-nav-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px !important;
          font-size: 0.75rem !important;
          font-weight: 600 !important;
          border-radius: var(--radius-sm) !important;
          border: 1px solid var(--border-color) !important;
          color: var(--text-secondary) !important;
          background: var(--bg-secondary) !important;
          cursor: pointer;
          transition: all var(--transition-fast) ease;
        }
        .home-nav-btn:hover {
          background: var(--bg-card-hover) !important;
          border-color: var(--border-active) !important;
          color: var(--text-primary) !important;
        }
        
        .login-header-mobile {
          text-align: center;
          margin-bottom: 24px;
        }
        .login-logo-container {
          display: flex;
          justify-content: center;
          align-items: center;
          margin-bottom: 12px;
        }
        .login-logo-img {
          width: 64px;
          height: 64px;
          object-fit: contain;
          border-radius: var(--radius-md);
          border: 1px solid var(--border-color);
          box-shadow: var(--shadow-sm);
          transition: transform var(--transition-fast) var(--ease-spring);
        }
        .login-logo-img:hover {
          transform: scale(1.08) rotate(3deg);
        }
        
        .login-title {
          font-family: var(--font-display);
          font-size: 1.75rem;
          font-weight: 800;
          background: var(--gradient-primary);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          margin: 0 0 4px;
          letter-spacing: -0.03em;
        }
        .login-subtitle {
          font-size: 0.68rem;
          color: var(--text-secondary);
          letter-spacing: 0.08em;
          text-transform: uppercase;
          font-weight: 700;
          margin: 0;
          opacity: 0.8;
        }
        
        .login-tabs {
          display: flex;
          gap: 6px;
          margin-bottom: 24px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-md);
          padding: 4px;
        }
        .login-tab-btn {
          flex: 1;
          padding: 8px;
          font-size: 0.75rem;
          font-weight: 700;
          border-radius: var(--radius-sm);
          color: var(--text-secondary);
          transition: all var(--transition-fast) ease;
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
          margin-bottom: 18px;
          text-align: left;
        }
        .login-label {
          font-size: 0.7rem;
          color: var(--text-muted);
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          display: block;
          margin-bottom: 6px;
        }
        .input-with-icon {
          position: relative;
          display: flex;
          align-items: center;
        }
        .input-icon {
          position: absolute;
          left: 14px;
          color: var(--text-muted);
          font-size: 18px;
          pointer-events: none;
        }
        
        .login-input {
          width: 100%;
          height: 44px;
          background: var(--bg-input);
          border: 1.5px solid var(--border-color);
          border-radius: var(--radius-sm);
          padding: 0 16px 0 42px;
          color: var(--text-primary);
          font-size: 0.9375rem;
          transition: all var(--transition-fast) ease;
          box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.01);
        }
        .login-input:focus {
          border-color: var(--color-primary);
          box-shadow: 0 0 0 3px var(--color-primary-glow);
          outline: none;
        }
        
        .login-submit-btn {
          width: 100%;
          height: 44px;
          border-radius: var(--radius-sm);
          font-weight: 700;
          margin-top: 8px;
          background: var(--gradient-primary);
          border: none;
          color: #FFFFFF;
          font-size: 0.875rem;
          letter-spacing: 0.02em;
          transition: all var(--transition-fast) ease;
          box-shadow: var(--shadow-sm);
          cursor: pointer;
        }
        .login-submit-btn:hover:not(:disabled) {
          opacity: 0.95;
          transform: translateY(-1px);
          box-shadow: var(--shadow-md);
        }
        .login-submit-btn:active:not(:disabled) {
          transform: scale(0.98) translateY(0);
        }
        .login-submit-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        
        .login-toggle-link {
          font-size: 0.72rem;
          color: var(--text-secondary);
          margin-top: 18px;
          cursor: pointer;
          text-decoration: underline;
          transition: color var(--transition-fast);
          display: inline-block;
          text-align: center;
          width: 100%;
        }
        .login-toggle-link:hover {
          color: var(--color-primary);
        }
        
        .login-pin-section {
          margin-bottom: 24px;
          text-align: center;
        }
        .login-pin-dots {
          display: flex;
          gap: 16px;
          justify-content: center;
          margin-top: 12px;
          margin-bottom: 12px;
        }
        .pin-dot {
          width: 14px;
          height: 14px;
          border-radius: 50%;
          border: 2px solid var(--border-active);
          background: transparent;
          transition: all var(--transition-fast) var(--ease-out-expo);
        }
        .pin-dot.filled {
          background: var(--color-primary);
          border-color: var(--color-primary);
          box-shadow: var(--shadow-primary);
          transform: scale(1.2);
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
          font-size: 0.72rem;
          color: var(--color-danger);
          font-weight: 600;
          min-height: 18px;
          margin-bottom: 12px;
          letter-spacing: -0.01em;
          text-align: center;
        }
        
        .login-numpad {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
          max-width: 250px;
          margin: 0 auto 20px;
        }
        .numpad-btn {
          height: 56px;
          border-radius: var(--radius-md);
          border: 1px solid var(--border-color);
          background: var(--bg-secondary);
          color: var(--text-primary);
          font-size: 1.3rem;
          font-weight: 700;
          cursor: pointer;
          font-family: var(--font-sans);
          transition: all var(--transition-fast) ease, transform var(--transition-fast) var(--ease-spring);
          display: flex;
          align-items: center;
          justify-content: center;
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
          border-color: var(--color-primary);
        }
        .numpad-btn.empty {
          visibility: hidden;
        }
        .numpad-btn.backspace {
          color: var(--text-secondary);
        }
        
        .login-footer {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding-top: 16px;
          border-top: 1px solid var(--border-color);
          margin-top: 24px;
        }
        .footer-dot {
          color: var(--color-primary);
          font-size: 8px;
          opacity: 0.5;
        }
        .footer-powered {
          font-size: 0.5rem;
          color: var(--text-secondary);
          opacity: 0.5;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          font-weight: 700;
        }
        .footer-brand {
          font-size: 0.5rem;
          color: var(--color-primary);
          letter-spacing: 0.06em;
          font-weight: 700;
        }
        
        /* ── Responsive Layout Logic ── */
        @media (min-width: 768px) {
          .login-header-mobile {
            display: none;
          }
          .login-card {
            box-shadow: none;
            border: none;
            background: transparent;
            padding: 0;
            max-width: 360px;
            backdrop-filter: none;
            -webkit-backdrop-filter: none;
          }
          .login-form-panel {
            background: var(--bg-surface);
          }
        }
        
        @media (max-width: 360px) {
          .login-card {
            padding: 24px 20px 20px;
            border-radius: var(--radius-lg);
          }
          .login-title {
            font-size: 1.5rem;
          }
          .login-logo-img {
            width: 56px;
            height: 56px;
          }
          .login-tabs {
            margin-bottom: 16px;
            padding: 2px;
          }
          .login-tab-btn {
            padding: 6px;
            font-size: 0.68rem;
          }
          .numpad-btn {
            height: 48px;
            font-size: 1.15rem;
          }
          .login-numpad {
            gap: 8px;
            margin-bottom: 16px;
          }
          .login-input {
            height: 40px;
            font-size: var(--text-sm);
          }
          .login-error {
            font-size: 0.68rem;
            margin-bottom: 8px;
          }
        }
      </style>
    `;

    this.bindEvents();
  }

  bindEvents() {
    const logoBtn = document.getElementById('login-logo-btn');
    const titleBtn = document.getElementById('login-brand-title');
    const homeBtn = document.getElementById('login-home-btn');

    const goHome = (e) => {
      e?.preventDefault();
      playSound(700, 80);
      this.destroy();
      window.location.hash = '#/self-order';
      if (window.location.hash === '#/self-order') {
        window.location.reload();
      }
    };

    logoBtn?.addEventListener('click', goHome);
    titleBtn?.addEventListener('click', goHome);
    homeBtn?.addEventListener('click', goHome);

    const tabCloud = document.getElementById('tab-cloud');
    const tabPin = document.getElementById('tab-pin');
    const secCloud = document.getElementById('section-cloud');
    const secPin = document.getElementById('section-pin');
    const secSignup = document.getElementById('section-signup');
    const btnCloud = document.getElementById('btn-cloud-login');
    const btnSignup = document.getElementById('btn-submit-signup');
    const errEl = document.getElementById('login-error');
    const tabsContainer = document.getElementById('login-tabs-container');

    const linkSignup = document.getElementById('link-goto-signup');
    const linkSignin = document.getElementById('link-goto-signin');

    // Tab Switches
    tabCloud?.addEventListener('click', () => {
      tabCloud.classList.add('active');
      tabPin.classList.remove('active');
      if (secCloud) secCloud.style.display = 'block';
      if (secPin) secPin.style.display = 'none';
      if (secSignup) secSignup.style.display = 'none';
      if (errEl) errEl.textContent = '';
      playSound(650, 60);
    });

    tabPin?.addEventListener('click', () => {
      tabPin.classList.add('active');
      tabCloud.classList.remove('active');
      if (secPin) secPin.style.display = 'block';
      if (secCloud) secCloud.style.display = 'none';
      if (secSignup) secSignup.style.display = 'none';
      if (errEl) errEl.textContent = '';
      playSound(650, 60);
    });

    // Custom Switch to Sign Up
    linkSignup?.addEventListener('click', () => {
      if (secCloud) secCloud.style.display = 'none';
      if (secPin) secPin.style.display = 'none';
      if (secSignup) secSignup.style.display = 'block';
      if (tabsContainer) tabsContainer.style.display = 'none';
      if (errEl) errEl.textContent = '';
      playSound(700, 70);
    });

    // Custom Switch Back to Sign In
    linkSignin?.addEventListener('click', () => {
      if (secCloud) secCloud.style.display = 'block';
      if (secPin) secPin.style.display = 'none';
      if (secSignup) secSignup.style.display = 'none';
      if (tabsContainer) tabsContainer.style.display = 'flex';
      if (errEl) errEl.textContent = '';
      playSound(700, 70);
    });

    btnCloud?.addEventListener('click', () => this.attemptCloudLogin());
    btnSignup?.addEventListener('click', () => this.attemptSignup());

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
      } else if (secSignup && secSignup.style.display === 'block' && e.key === 'Enter') {
        this.attemptSignup();
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
        const welcomeMsg = staff.role === 'customer' 
          ? `Welcome to The Taste, ${staff.name}!`
          : `Welcome, ${staff.name}! (${staff.role})`;
        showToast(welcomeMsg, 'success');
        this.destroy();
        if (this.onLoginSuccess) this.onLoginSuccess(staff);
      } else {
        throw new Error('Could not resolve session.');
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

  async attemptSignup() {
    const nameEl = document.getElementById('signup-name');
    const emailEl = document.getElementById('signup-email');
    const passwordEl = document.getElementById('signup-password');
    const errEl = document.getElementById('login-error');
    const btnSignup = document.getElementById('btn-submit-signup');

    const name = nameEl?.value.trim();
    const email = emailEl?.value.trim();
    const password = passwordEl?.value;

    if (!name || !email || !password) {
      showToast('All fields are required', 'warning');
      return;
    }
    if (password.length < 6) {
      showToast('Password must be at least 6 characters', 'warning');
      return;
    }

    try {
      if (errEl) errEl.textContent = '';
      if (btnSignup) {
        btnSignup.disabled = true;
        btnSignup.textContent = 'Creating Account...';
      }

      // Register the customer in Supabase Auth
      const signupResult = await signUpCustomer(email, password);
      if (!signupResult.success) {
        throw new Error(signupResult.message || 'Failed to create account.');
      }

      // Login using newly created customer credentials.
      const staff = await authService.loginCustomerWithCloudCredentials(email, password);
      if (staff) {
        playSound(900, 100);
        vibrateDevice([40, 20, 40]);
        
        // Update customer profile name
        if (staff.id) {
          try {
            const { db } = await import('../db/database.js');
            await db.customers.update(staff.id, { name });
            staff.name = name;
          } catch (e) {
            console.error('[Signup] Local CRM name update failed:', e);
          }
        }

        showToast(`Registration successful! Welcome to The Taste, ${name}!`, 'success');
        this.destroy();
        if (this.onLoginSuccess) this.onLoginSuccess(staff);
      } else {
        throw new Error('Registration succeeded, but auto-login failed.');
      }
    } catch (err) {
      playSound(200, 200);
      vibrateDevice([100]);
      if (errEl) errEl.textContent = err.message || 'Signup failed. Please try again.';
      if (btnSignup) {
        btnSignup.disabled = false;
        btnSignup.textContent = 'Register & Order';
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
