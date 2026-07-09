// @ts-nocheck
/**
 * ═══════════════════════════════════════════════════
 *  NextGenOS Restaurant Operating System
 *  Component: Decoupled Customer Login & Signup Screen
 *  Version: 1.0.0
 *  © 2026 NextGenOS. All Rights Reserved.
 *  This software is proprietary and confidential.
 * ═══════════════════════════════════════════════════
 */

import { authService } from '../services/auth';
import { signUpCustomer } from '../services/supabaseClient';
import { showToast, playSound, vibrateDevice } from '../utils/helpers';

export class CustomerLoginScreen {
  constructor(onLoginSuccess, options = {}) {
    this.onLoginSuccess = onLoginSuccess;
    this.options = options;
  }

  render(container) {
    this.container = container;

    container.innerHTML = `
      <div class="login-screen">
        <div class="login-split-container">
          
          <!-- Left side: Premium Branding Panel (visible on desktop) -->
          <div class="login-brand-panel">
            <div class="login-brand-content">
              <div class="login-brand-logo-wrapper">
                <img src="/assets/the-taste-logo.png" class="brand-panel-logo" alt="The Taste Logo" />
              </div>
              <h2 class="brand-panel-title">The Taste</h2>
              <p class="brand-panel-tagline">Delicious Indo-Chinese Storefront</p>
              
              <div class="brand-features-list">
                <div class="brand-feature-item">
                  <span class="material-symbols-rounded feature-icon">star</span>
                  <div class="feature-text">
                    <h4 class="feature-title">Loyalty Rewards</h4>
                    <p class="feature-desc">Earn points on every bite and redeem them at checkout for discount coupons.</p>
                  </div>
                </div>
                <div class="brand-feature-item">
                  <span class="material-symbols-rounded feature-icon">shopping_bag</span>
                  <div class="feature-text">
                    <h4 class="feature-title">Skip the Queue</h4>
                    <p class="feature-desc">Order ahead for self-pickup or dine-in, and have your meal ready when you arrive.</p>
                  </div>
                </div>
                <div class="brand-feature-item">
                  <span class="material-symbols-rounded feature-icon">qr_code_2</span>
                  <div class="feature-text">
                    <h4 class="feature-title">Dine-In QR Ordering</h4>
                    <p class="feature-desc">Scan any table QR code, choose your food, and place your order instantly from your browser.</p>
                  </div>
                </div>
                <div class="brand-feature-item">
                  <span class="material-symbols-rounded feature-icon">payments</span>
                  <div class="feature-text">
                    <h4 class="feature-title">Flexible Payments</h4>
                    <p class="feature-desc">Complete checkout seamlessly with UPI or select Cash on Delivery / Pay at Counter.</p>
                  </div>
                </div>
              </div>
            </div>
            
            <div class="brand-panel-footer">
              <span>Customer Loyalty Edition</span>
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
                  <img src="/assets/the-taste-logo.png" class="login-logo-img" alt="The Taste Logo" />
                </div>
                <h1 class="login-title" id="login-brand-title">The Taste</h1>
                <p class="login-subtitle">Delicious Indo-Chinese Storefront</p>
              </div>
              
              <div style="margin-bottom: 20px; text-align: center;">
                <h2 style="font-family: var(--font-display); font-size: var(--text-md); font-weight: 700; color: var(--text-primary); margin-bottom: 4px; letter-spacing: -0.01em;">Welcome to Rewards</h2>
                <p style="color: var(--text-secondary); font-size: var(--text-xs); margin: 0; font-weight: 500;">Sign in to check points and place orders</p>
              </div>

              <div id="login-error" class="login-error"></div>

              <!-- Cloud Sign-In Form -->
              <div class="login-section" id="section-cloud" style="display: block;">
                <div class="login-input-group">
                  <label class="login-label" for="login-email">Account Email</label>
                  <div class="input-with-icon">
                    <span class="material-symbols-rounded input-icon">mail</span>
                    <input type="email" id="login-email" class="login-input" placeholder="yourname@gmail.com" required autocomplete="username">
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
                  Sign In & Order
                </button>
                <p class="login-toggle-link" id="link-goto-signup">New to The Taste? Register Account</p>
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
                  <label class="signup-label" for="signup-email" style="display: block; font-size: var(--text-xs); font-weight: 600; color: var(--text-secondary); margin-bottom: 6px;">Email Address</label>
                  <div class="input-with-icon">
                    <span class="material-symbols-rounded input-icon">mail</span>
                    <input type="email" id="signup-email" class="login-input" placeholder="aarav@gmail.com" required autocomplete="username">
                  </div>
                </div>
                <div class="login-input-group" style="margin-top: 12px;">
                  <label class="signup-label" for="signup-password" style="display: block; font-size: var(--text-xs); font-weight: 600; color: var(--text-secondary); margin-bottom: 6px;">Password</label>
                  <div class="input-with-icon">
                    <span class="material-symbols-rounded input-icon">lock</span>
                    <input type="password" id="signup-password" class="login-input" placeholder="Minimum 6 characters" required autocomplete="new-password">
                  </div>
                </div>
                <button class="btn btn-primary login-submit-btn" id="btn-submit-signup" type="button" style="margin-top: 16px;">
                  Register & Order
                </button>
                <p class="login-toggle-link" id="link-goto-signin">Already have an account? Sign In</p>
              </div>

              <div class="login-footer" style="flex-direction:column; gap:10px; padding-top:14px; border-top:1px solid var(--border-color); margin-top:24px;">
                <a href="https://scxfkjtrrfgpusyigntx.supabase.co/storage/v1/object/public/apks/TheTasteCustomer.apk" download class="btn btn-secondary btn-sm" style="display:inline-flex; align-items:center; gap:6px; font-size:0.75rem; font-weight:700; color:#FF6B35; border-color:rgba(255, 107, 53, 0.2); background:rgba(255, 107, 53, 0.04); text-decoration:none; padding:8px 16px; border-radius:8px; width:100%; justify-content:center;">
                  <span class="material-symbols-rounded" style="font-size:16px;">android</span>
                  Download Customer App (APK)
                </a>
                <div style="display:flex; align-items:center; gap:6px; justify-content:center; opacity:0.6;">
                  <span class="footer-dot">◆</span>
                  <span class="footer-powered">Powered by</span>
                  <span class="footer-brand">NextGenOS</span>
                </div>
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
          color: var(--text-primary) !important;
          border-color: var(--border-active) !important;
          background: var(--bg-active) !important;
        }
        
        .login-header-mobile {
          text-align: center;
          margin-bottom: 32px;
        }
        
        .login-logo-container {
          width: 64px;
          height: 64px;
          border-radius: var(--radius-md);
          background: #FFFFFF;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 16px;
          box-shadow: var(--shadow-md);
          border: 1px solid var(--border-color);
        }
        
        .login-logo-img {
          width: 50px;
          height: 50px;
          object-fit: contain;
        }
        
        .login-title {
          font-family: var(--font-display);
          font-size: 1.75rem;
          font-weight: 800;
          color: var(--text-primary);
          margin: 0 0 6px;
          letter-spacing: -0.03em;
        }
        
        .login-subtitle {
          font-size: 0.75rem;
          color: var(--text-muted);
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin: 0;
        }
        
        .login-error {
          color: var(--color-error, #EF4444);
          font-size: 0.75rem;
          font-weight: 600;
          text-align: center;
          margin-bottom: 16px;
          min-height: 18px;
        }
        
        .login-input-group {
          margin-bottom: 18px;
        }
        
        .login-label {
          display: block;
          font-size: var(--text-xs);
          font-weight: 600;
          color: var(--text-secondary);
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
          padding: 0 16px 0 42px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-md);
          color: var(--text-primary);
          font-size: var(--text-sm);
          font-family: var(--font-sans);
          transition: all var(--transition-fast) ease;
        }
        
        .login-input:focus {
          outline: none;
          border-color: var(--border-active);
          background: var(--bg-active);
          box-shadow: 0 0 0 3px rgba(255, 107, 53, 0.15);
        }
        
        .login-submit-btn {
          width: 100%;
          height: 44px;
          font-size: var(--text-sm);
          font-weight: 700;
          letter-spacing: 0.02em;
          margin-top: 10px;
          border-radius: var(--radius-md);
        }
        
        .login-toggle-link {
          font-size: var(--text-xs);
          font-weight: 600;
          color: var(--color-primary);
          text-align: center;
          margin: 16px 0 0;
          cursor: pointer;
          transition: opacity var(--transition-fast) ease;
        }
        .login-toggle-link:hover {
          opacity: 0.8;
          text-decoration: underline;
        }
        
        .login-footer {
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.65rem;
          color: var(--text-muted);
        }
        .footer-dot {
          font-size: 8px;
          color: var(--color-primary);
        }
        .footer-powered {
          font-weight: 500;
        }
        .footer-brand {
          font-weight: 700;
          color: var(--text-secondary);
        }
      </style>
    `;

    // Bind event handlers
    const btnHome = document.getElementById('login-home-btn');
    const btnLogo = document.getElementById('login-logo-btn');
    const linkSignup = document.getElementById('link-goto-signup');
    const linkSignin = document.getElementById('link-goto-signin');
    const btnCloud = document.getElementById('btn-cloud-login');
    const btnSignup = document.getElementById('btn-submit-signup');

    const secCloud = document.getElementById('section-cloud');
    const secSignup = document.getElementById('section-signup');
    const errEl = document.getElementById('login-error');

    // Home / Brand click navigates back
    const handleHomeClick = () => {
      playSound(700, 50);
      this.destroy();
    };
    btnHome?.addEventListener('click', handleHomeClick);
    btnLogo?.addEventListener('click', handleHomeClick);

    // Switch tabs
    linkSignup?.addEventListener('click', () => {
      if (secCloud) secCloud.style.display = 'none';
      if (secSignup) secSignup.style.display = 'block';
      if (errEl) errEl.textContent = '';
      playSound(700, 70);
    });

    linkSignin?.addEventListener('click', () => {
      if (secCloud) secCloud.style.display = 'block';
      if (secSignup) secSignup.style.display = 'none';
      if (errEl) errEl.textContent = '';
      playSound(700, 70);
    });

    btnCloud?.addEventListener('click', () => this.attemptCloudLogin());
    btnSignup?.addEventListener('click', () => this.attemptSignup());

    // Keyboard support
    this._keyHandler = (e) => {
      if (secCloud && secCloud.style.display === 'block' && e.key === 'Enter') {
        this.attemptCloudLogin();
      } else if (secSignup && secSignup.style.display === 'block' && e.key === 'Enter') {
        this.attemptSignup();
      }
    };
    document.addEventListener('keydown', this._keyHandler);
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

      const staff = await authService.loginCustomerWithCloudCredentials(email, password);
      
      if (staff) {
        playSound(900, 100);
        vibrateDevice([40, 20, 40]);
        showToast(`Welcome to The Taste, ${staff.name}!`, 'success');
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
        btnCloud.textContent = 'Sign In & Order';
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
            const { db } = await import('../db/database');
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
