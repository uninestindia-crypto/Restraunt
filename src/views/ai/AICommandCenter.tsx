/**
 * ═══════════════════════════════════════════════════
 *  NextGenOS Restaurant Operating System
 *  Module: AI Command Center (3-Tier)
 *  Version: 2.0.0
 *  © 2026 NextGenOS. All Rights Reserved.
 *  This software is proprietary and confidential.
 * ═══════════════════════════════════════════════════
 */

import { aiService } from '../../services/ai';
import { showToast, playSound, vibrateDevice } from '../../utils/helpers';

const TIER_BADGES = {
  codebase: { label: '💻 Local AI', color: 'rgba(148,163,184,0.6)', bg: 'rgba(148,163,184,0.08)' },
  groq: { label: '⚡ Groq', color: 'var(--color-success-on-surface)', bg: 'rgba(var(--color-success-rgb),0.08)' },
  lightning: { label: '🧠 Lightning', color: 'var(--nextgenos-purple-on-surface)', bg: 'rgba(var(--nextgenos-purple-rgb),0.08)' },
};

export class AICommandCenter {
  // Fields these methods assign. Type-only: `declare` emits nothing, so the
  // runtime shape of the class is unchanged.
  declare app: any;
  declare container: any;
  declare messages: any;

  constructor(app) {
    this.app = app;
    this.container = null;
    this.messages = [];
  }

  async mount(container) {
    this.container = container;
    this.messages = [];

    // Pre-load AI config
    await aiService.loadConfig();

    this.render();
    this.bindEvents();

    // Dynamic welcome message based on available tiers
    const tiers = [];
    tiers.push('💻 **Local AI** (always available)');
    if (aiService.isGroqAvailable) tiers.push('⚡ **Groq** (cloud chat)');
    if (aiService.isLightningAvailable) tiers.push('🧠 **Lightning** (complex analytics)');

    const tierList = tiers.map(t => `• ${t}`).join('\n');

    this.addAIMessage(
      `👋 **Welcome to the AI Command Center!**\n\n` +
      `I'm your restaurant intelligence assistant powered by a 3-tier AI system:\n\n${tierList}\n\n` +
      `Ask me anything about your business — revenue, best sellers, forecasts, generate reports, or get marketing ideas.\n\n` +
      `Try one of the quick actions below!`,
      ['📊 Today\'s Summary', '🏆 Best Sellers', '📈 Forecast Tomorrow', '📊 Generate Report'],
      'codebase'
    );
  }

  render() {
    this.container.innerHTML = `
      <div style="flex:1;display:flex;flex-direction:column;height:100%;overflow:hidden;background:var(--bg-primary);">
        <!-- Header -->
        <div style="display:flex;align-items:center;gap:12px;padding:16px 24px;background:var(--glass-bg);backdrop-filter:blur(20px);border-bottom:1px solid var(--border-glass);z-index:10;">
          <div style="width:40px;height:40px;border-radius:12px;background:rgba(108,92,231,0.1);border:1px solid rgba(108,92,231,0.25);display:flex;align-items:center;justify-content:center;">
            <span class="material-symbols-rounded" style="font-size:22px;color:#A29BFE;filter:drop-shadow(0 0 6px rgba(108,92,231,0.4));">smart_toy</span>
          </div>
          <div>
            <h2 style="font-family:'Plus Jakarta Sans',sans-serif;font-size:var(--text-lg);font-weight:800;color:var(--text-primary);letter-spacing:-0.02em;margin:0;">AI Command Center</h2>
            <div style="font-size:0.55rem;color:var(--nextgenos-purple-on-surface);font-weight:500;letter-spacing:0.08em;text-transform:uppercase;">3-Tier AI • Groq Chat • Lightning Analytics • Local Offline</div>
          </div>
          <div style="margin-left:auto;display:flex;gap:6px;">
            ${aiService.isGroqAvailable ? '<span style="padding:3px 8px;border-radius:12px;background:rgba(var(--color-success-rgb),0.08);border:1px solid rgba(var(--color-success-rgb),0.2);font-size:0.6rem;color:var(--color-success-on-surface);font-weight:600;">⚡ Groq</span>' : ''}
            ${aiService.isLightningAvailable ? '<span style="padding:3px 8px;border-radius:12px;background:rgba(var(--nextgenos-purple-rgb),0.08);border:1px solid rgba(var(--nextgenos-purple-rgb),0.2);font-size:0.6rem;color:var(--nextgenos-purple);font-weight:600;">🧠 Lightning</span>' : ''}
            <span style="padding:3px 8px;border-radius:12px;background:rgba(148,163,184,0.08);border:1px solid rgba(148,163,184,0.15);font-size:0.6rem;color:rgba(148,163,184,0.7);font-weight:600;">💻 Local</span>
          </div>
        </div>

        <!-- Messages Area -->
        <div id="ai-messages" style="flex:1;overflow-y:auto;padding:20px 24px;display:flex;flex-direction:column;gap:16px;scroll-behavior:smooth;">
          <!-- Messages render here -->
        </div>

        <!-- Input Bar -->
        <div style="padding:16px 24px;background:rgba(17,17,30,0.95);backdrop-filter:blur(16px);border-top:1px solid var(--border-glass);">
          <div style="display:flex;gap:10px;max-width:800px;margin:0 auto;">
            <input type="text" id="ai-input" placeholder="Ask anything about your business..." style="flex:1;padding:12px 16px;background:rgba(255,255,255,0.03);border:1px solid var(--border-glass);border-radius:12px;color:var(--text-primary);font-size:var(--text-sm);font-family:'Inter',sans-serif;outline:none;transition:border-color 0.2s;">
            <button id="ai-send" style="width:44px;height:44px;border-radius:12px;background:linear-gradient(135deg,#6C5CE7,#A29BFE);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:transform 0.15s,box-shadow 0.2s;box-shadow:0 4px 15px rgba(108,92,231,0.3);flex-shrink:0;">
              <span class="material-symbols-rounded" style="font-size:20px;color:white;">send</span>
            </button>
          </div>
        </div>
      </div>
    `;
  }

  bindEvents() {
    const input = document.getElementById('ai-input');
    const sendBtn = document.getElementById('ai-send');

    const handleSend = () => {
      const query = (input as HTMLInputElement).value.trim();
      if (!query) return;
      (input as HTMLInputElement).value = '';
      playSound(700, 80);
      this.handleQuery(query);
    };

    sendBtn.addEventListener('click', handleSend);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleSend(); });
    input.addEventListener('focus', () => { input.style.borderColor = 'rgba(108,92,231,0.4)'; });
    input.addEventListener('blur', () => { input.style.borderColor = 'var(--border-glass)'; });
  }

  addUserMessage(text) {
    const container = document.getElementById('ai-messages');
    if (!container) return;
    const div = document.createElement('div');
    div.style.cssText = 'display:flex;justify-content:flex-end;animation:slideUp 0.3s ease;';
    div.innerHTML = `
      <div style="max-width:75%;padding:12px 16px;background:linear-gradient(135deg,var(--color-primary),#FF8960);border-radius:16px 16px 4px 16px;color:white;font-size:var(--text-sm);font-weight:500;line-height:1.5;box-shadow:0 4px 15px rgba(255,107,53,0.2);">${this.escapeHtml(text)}</div>
    `;
    container.appendChild(div);
    this.scrollToBottom();
  }

  addAIMessage(text, suggestions = [], tier = 'codebase') {
    const container = document.getElementById('ai-messages');
    if (!container) return;

    const badge = TIER_BADGES[tier] || TIER_BADGES.codebase;

    const formatted = this.escapeHtml(text)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br>');

    const chipsHTML = suggestions.length > 0 ? `
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:12px;">
        ${suggestions.map(s => `<button class="ai-chip" style="padding:6px 14px;border-radius:20px;background:rgba(108,92,231,0.08);border:1px solid rgba(108,92,231,0.2);color:#A29BFE;font-size:0.75rem;font-weight:600;cursor:pointer;transition:all 0.2s;font-family:'Inter',sans-serif;">${this.escapeHtml(s)}</button>`).join('')}
      </div>
    ` : '';

    const div = document.createElement('div');
    div.style.cssText = 'display:flex;justify-content:flex-start;animation:slideUp 0.3s ease;';
    div.innerHTML = `
      <div style="max-width:85%;">
        <div style="padding:16px 18px;background:rgba(255,255,255,0.02);border:1px solid var(--border-glass);border-radius:4px 16px 16px 16px;color:var(--text-primary);font-size:var(--text-sm);line-height:1.6;backdrop-filter:blur(8px);">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
            <div style="display:flex;align-items:center;gap:5px;font-size:0.6rem;color:var(--nextgenos-purple-on-surface);font-weight:600;letter-spacing:0.06em;text-transform:uppercase;">
              <span class="material-symbols-rounded" style="font-size:13px;">smart_toy</span> AI Assistant
            </div>
            <span style="padding:2px 8px;border-radius:10px;background:${badge.bg};font-size:0.55rem;color:${badge.color};font-weight:700;letter-spacing:0.04em;">${badge.label}</span>
          </div>
          ${formatted}
          ${chipsHTML}
        </div>
      </div>
    `;
    container.appendChild(div);

    // Bind chip clicks
    div.querySelectorAll('.ai-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        playSound(600, 80);
        this.handleQuery(chip.textContent.trim());
      });
      chip.addEventListener('mouseenter', () => {
        (chip as HTMLElement).style.background = 'rgba(108,92,231,0.15)';
        (chip as HTMLElement).style.borderColor = 'rgba(108,92,231,0.4)';
      });
      chip.addEventListener('mouseleave', () => {
        (chip as HTMLElement).style.background = 'rgba(108,92,231,0.08)';
        (chip as HTMLElement).style.borderColor = 'rgba(108,92,231,0.2)';
      });
    });

    this.scrollToBottom();
  }

  addTypingIndicator() {
    const container = document.getElementById('ai-messages');
    if (!container) return;
    const div = document.createElement('div');
    div.id = 'ai-typing';
    div.style.cssText = 'display:flex;justify-content:flex-start;animation:slideUp 0.3s ease;';
    div.innerHTML = `
      <div style="padding:12px 18px;background:rgba(255,255,255,0.02);border:1px solid var(--border-glass);border-radius:4px 16px 16px 16px;display:flex;gap:5px;align-items:center;">
        <span style="width:7px;height:7px;border-radius:50%;background:#A29BFE;animation:bounce 1.4s infinite;animation-delay:0s;opacity:0.7;"></span>
        <span style="width:7px;height:7px;border-radius:50%;background:#A29BFE;animation:bounce 1.4s infinite;animation-delay:0.2s;opacity:0.7;"></span>
        <span style="width:7px;height:7px;border-radius:50%;background:#A29BFE;animation:bounce 1.4s infinite;animation-delay:0.4s;opacity:0.7;"></span>
      </div>
    `;
    container.appendChild(div);
    this.scrollToBottom();
  }

  removeTypingIndicator() {
    const el = document.getElementById('ai-typing');
    if (el) el.remove();
  }

  async handleQuery(query) {
    this.addUserMessage(query);
    this.addTypingIndicator();

    // Simulate slight delay for natural feel
    await new Promise(r => setTimeout(r, 400 + Math.random() * 400));

    const response = await aiService.processQuery(query);
    this.removeTypingIndicator();
    this.addAIMessage(response.content, response.suggestions || [], response.tier || 'codebase');
    playSound(800, 80);
    vibrateDevice([30]);
  }

  scrollToBottom() {
    const container = document.getElementById('ai-messages');
    if (container) {
      requestAnimationFrame(() => { container.scrollTop = container.scrollHeight; });
    }
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  unmount() {
    this.container = null;
  }
}
