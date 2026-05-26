/**
 * ═══════════════════════════════════════════════════
 *  NextGenOS Restaurant Operating System
 *  Module: AI Command Center
 *  Version: 2.0.0
 *  © 2026 NextGenOS. All Rights Reserved.
 *  This software is proprietary and confidential.
 * ═══════════════════════════════════════════════════
 */

import { aiService } from '../../services/ai.js';
import { showToast, playSound, vibrateDevice } from '../../utils/helpers.js';

export class AICommandCenter {
  constructor(app) {
    this.app = app;
    this.container = null;
    this.messages = [];
  }

  async mount(container) {
    this.container = container;
    this.messages = [];
    this.render();
    this.bindEvents();
    this.addAIMessage(`👋 **Welcome to the AI Command Center!**\n\nI'm your intelligent restaurant assistant. Ask me anything about your business — revenue, best sellers, forecasts, or even generate marketing messages.\n\nTry one of the quick actions below, or type your own question!`, ['📊 Today\'s Summary', '🏆 Best Sellers', '📈 Revenue Forecast', '⏰ Peak Hours']);
  }

  render() {
    this.container.innerHTML = `
      <div style="flex:1;display:flex;flex-direction:column;height:100%;overflow:hidden;background:var(--bg-primary);">
        <!-- Header -->
        <div style="display:flex;align-items:center;gap:12px;padding:16px 24px;background:rgba(9,9,14,0.8);backdrop-filter:blur(20px);border-bottom:1px solid var(--border-glass);z-index:10;">
          <div style="width:40px;height:40px;border-radius:12px;background:rgba(108,92,231,0.1);border:1px solid rgba(108,92,231,0.25);display:flex;align-items:center;justify-content:center;">
            <span class="material-symbols-rounded" style="font-size:22px;color:#A29BFE;filter:drop-shadow(0 0 6px rgba(108,92,231,0.4));">smart_toy</span>
          </div>
          <div>
            <h2 style="font-family:'Plus Jakarta Sans',sans-serif;font-size:var(--text-lg);font-weight:800;color:var(--text-primary);letter-spacing:-0.02em;margin:0;">AI Command Center</h2>
            <div style="font-size:0.55rem;color:rgba(162,155,254,0.45);font-weight:500;letter-spacing:0.08em;text-transform:uppercase;">Powered by NextGenOS Intelligence</div>
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
      const query = input.value.trim();
      if (!query) return;
      input.value = '';
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
      <div style="max-width:75%;padding:12px 16px;background:linear-gradient(135deg,#FF6B35,#FF8960);border-radius:16px 16px 4px 16px;color:white;font-size:var(--text-sm);font-weight:500;line-height:1.5;box-shadow:0 4px 15px rgba(255,107,53,0.2);">${this.escapeHtml(text)}</div>
    `;
    container.appendChild(div);
    this.scrollToBottom();
  }

  addAIMessage(text, suggestions = []) {
    const container = document.getElementById('ai-messages');
    if (!container) return;

    const formatted = text
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br>');

    const chipsHTML = suggestions.length > 0 ? `
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:12px;">
        ${suggestions.map(s => `<button class="ai-chip" style="padding:6px 14px;border-radius:20px;background:rgba(108,92,231,0.08);border:1px solid rgba(108,92,231,0.2);color:#A29BFE;font-size:0.75rem;font-weight:600;cursor:pointer;transition:all 0.2s;font-family:'Inter',sans-serif;">${s}</button>`).join('')}
      </div>
    ` : '';

    const div = document.createElement('div');
    div.style.cssText = 'display:flex;justify-content:flex-start;animation:slideUp 0.3s ease;';
    div.innerHTML = `
      <div style="max-width:85%;">
        <div style="padding:16px 18px;background:rgba(255,255,255,0.02);border:1px solid var(--border-glass);border-radius:4px 16px 16px 16px;color:var(--text-primary);font-size:var(--text-sm);line-height:1.6;backdrop-filter:blur(8px);">
          <div style="display:flex;align-items:center;gap:5px;margin-bottom:8px;font-size:0.6rem;color:rgba(162,155,254,0.45);font-weight:600;letter-spacing:0.06em;text-transform:uppercase;">
            <span class="material-symbols-rounded" style="font-size:13px;">smart_toy</span> AI Assistant
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
        chip.style.background = 'rgba(108,92,231,0.15)';
        chip.style.borderColor = 'rgba(108,92,231,0.4)';
      });
      chip.addEventListener('mouseleave', () => {
        chip.style.background = 'rgba(108,92,231,0.08)';
        chip.style.borderColor = 'rgba(108,92,231,0.2)';
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
    await new Promise(r => setTimeout(r, 600 + Math.random() * 600));

    const response = await aiService.processQuery(query);
    this.removeTypingIndicator();
    this.addAIMessage(response.content, response.suggestions || []);
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
