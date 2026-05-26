/**
 * ═══════════════════════════════════════════════════
 *  NextGenOS Restaurant Operating System
 *  Module: Multi-Channel Hub
 *  Version: 2.0.0
 *  © 2026 NextGenOS. All Rights Reserved.
 *  This software is proprietary and confidential.
 * ═══════════════════════════════════════════════════
 */

import { db } from '../../db/database.js';
import { formatCurrency } from '../../utils/helpers.js';

const CHANNELS = [
  { id: 'pos', name: 'POS Counter', icon: 'point_of_sale', status: 'active', color: '#FF6B35' },
  { id: 'kiosk', name: 'Self-Order Kiosk', icon: 'touch_app', status: 'active', color: '#10B981' },
  { id: 'qr', name: 'QR Table Order', icon: 'qr_code_scanner', status: 'coming', color: '#3B82F6' },
  { id: 'whatsapp', name: 'WhatsApp Orders', icon: 'chat', status: 'coming', color: '#25D366' },
];

export class ChannelHub {
  constructor(app) { this.app = app; this.container = null; }

  async mount(container) {
    this.container = container;
    await this.render();
  }

  async render() {
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);
    const allOrders = await db.orders.where('createdAt').between(todayStart.toISOString(), todayEnd.toISOString()).toArray();
    const completed = allOrders.filter(o => o.paymentStatus === 'paid' || o.status === 'completed');
    const recentOrders = (await db.orders.reverse().sortBy('createdAt')).slice(0, 20);

    const channelData = CHANNELS.map(ch => {
      const chOrders = completed.filter(o => (o.channel || 'pos') === ch.id);
      return { ...ch, orders: chOrders.length, revenue: chOrders.reduce((s, o) => s + (o.total || 0), 0) };
    });

    this.container.innerHTML = `
      <div style="flex:1;display:flex;flex-direction:column;height:calc(100vh - 60px);height:calc(100dvh - 60px);overflow:hidden;background:var(--bg-primary);">
        <div style="display:flex;align-items:center;gap:10px;padding:16px 24px;background:rgba(9,9,14,0.8);backdrop-filter:blur(20px);border-bottom:1px solid var(--border-glass);z-index:10;">
          <span class="material-symbols-rounded" style="color:var(--color-primary);font-size:24px;">hub</span>
          <h2 style="font-family:'Plus Jakarta Sans',sans-serif;font-size:var(--text-lg);font-weight:800;color:var(--text-primary);margin:0;">Multi-Channel Hub</h2>
        </div>
        <div style="flex:1;overflow-y:auto;padding:20px 24px;display:flex;flex-direction:column;gap:20px;">
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px;">
            ${channelData.map(ch => `
              <div style="padding:20px;background:rgba(255,255,255,0.01);border:1px solid var(--border-glass);border-radius:16px;position:relative;overflow:hidden;">
                ${ch.status === 'coming' ? `<div style="position:absolute;top:10px;right:10px;font-size:0.55rem;padding:2px 8px;border-radius:6px;font-weight:700;color:#A29BFE;background:rgba(108,92,231,0.1);border:1px solid rgba(108,92,231,0.2);">Coming Soon</div>` : `<div style="position:absolute;top:12px;right:12px;width:8px;height:8px;border-radius:50%;background:#10B981;box-shadow:0 0 6px rgba(16,185,129,0.5);"></div>`}
                <div style="width:44px;height:44px;border-radius:12px;background:rgba(${ch.status === 'active' ? '255,107,53' : '148,163,184'},0.08);display:flex;align-items:center;justify-content:center;margin-bottom:14px;">
                  <span class="material-symbols-rounded" style="font-size:24px;color:${ch.color};">${ch.icon}</span>
                </div>
                <div style="font-family:'Plus Jakarta Sans',sans-serif;font-size:var(--text-sm);font-weight:800;color:var(--text-primary);margin-bottom:8px;">${ch.name}</div>
                ${ch.status === 'active' ? `
                  <div style="display:flex;gap:16px;">
                    <div><div style="font-size:0.6rem;color:var(--text-muted);font-weight:600;">Orders</div><div style="font-size:1.1rem;font-weight:800;color:var(--color-primary);font-family:'Plus Jakarta Sans',sans-serif;">${ch.orders}</div></div>
                    <div><div style="font-size:0.6rem;color:var(--text-muted);font-weight:600;">Revenue</div><div style="font-size:1.1rem;font-weight:800;color:var(--color-success);font-family:'Plus Jakarta Sans',sans-serif;">${formatCurrency(ch.revenue)}</div></div>
                  </div>
                ` : '<div style="font-size:0.7rem;color:var(--text-muted);font-weight:500;margin-top:4px;">Integration available soon via NextGenOS</div>'}
              </div>
            `).join('')}
          </div>

          <div>
            <h3 style="font-family:'Plus Jakarta Sans',sans-serif;font-size:var(--text-sm);font-weight:800;color:var(--text-primary);margin:0 0 12px;">Recent Orders (All Channels)</h3>
            <div style="display:flex;flex-direction:column;gap:8px;">
              ${recentOrders.length === 0 ? '<div style="text-align:center;padding:40px;color:var(--text-muted);font-size:var(--text-xs);">No orders yet</div>' :
                recentOrders.map(o => {
                  const items = typeof o.items === 'string' ? JSON.parse(o.items) : (o.items || []);
                  const channel = o.channel || 'pos';
                  const chCfg = CHANNELS.find(c => c.id === channel) || CHANNELS[0];
                  const statusColor = o.status === 'completed' ? '#10B981' : o.status === 'preparing' ? '#F59E0B' : o.status === 'ready' ? '#3B82F6' : 'var(--text-muted)';
                  const timeAgo = this.timeAgo(o.createdAt);
                  return `
                    <div style="display:flex;align-items:center;gap:12px;padding:12px 14px;background:rgba(255,255,255,0.01);border:1px solid var(--border-glass);border-radius:12px;">
                      <span class="material-symbols-rounded" style="font-size:18px;color:${chCfg.color};">${chCfg.icon}</span>
                      <div style="flex:1;min-width:0;">
                        <div style="display:flex;align-items:center;gap:6px;">
                          <span style="font-size:var(--text-xs);font-weight:700;color:var(--text-primary);">#${o.orderNumber}</span>
                          <span style="font-size:0.55rem;padding:1px 6px;border-radius:4px;font-weight:700;color:${chCfg.color};background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);">${chCfg.name}</span>
                        </div>
                        <div style="font-size:0.65rem;color:var(--text-muted);margin-top:2px;">${items.length} items · ${timeAgo}</div>
                      </div>
                      <div style="text-align:right;flex-shrink:0;">
                        <div style="font-size:var(--text-xs);font-weight:700;color:var(--color-primary);">${formatCurrency(o.total || 0)}</div>
                        <div style="font-size:0.55rem;color:${statusColor};font-weight:700;text-transform:uppercase;margin-top:2px;">${o.status || 'new'}</div>
                      </div>
                    </div>`;
                }).join('')}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  timeAgo(dateStr) {
    if (!dateStr) return '—';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  unmount() { this.container = null; }
}
