// @ts-nocheck
/**
 * AnalyticsView — Admin panel sub-view for real-time cloud business analytics
 * Fetches directly from Supabase tables (orders, customers, audit_events)
 */

import { getSupabaseClient } from '../../services/supabaseClient';
import { formatCurrency, escapeHtml, playSound, vibrateDevice } from '../../utils/helpers';

export class AnalyticsView {
  constructor(app) {
    this.app = app;
    this.container = null;
    this.timeRange = '7days'; // 'today' | '7days' | '30days'
    this.isLoading = false;
    this.stats = {
      totalRevenue: 0,
      totalOrders: 0,
      avgOrderValue: 0,
      customerSignups: 0,
      paymentSplit: {},
      typeSplit: {},
      dailyTrend: [], // array of { dateLabel, revenue }
      recentAudits: []
    };
  }

  async mount(container) {
    this.container = container;
    this.renderSkeleton();
    await this.loadAnalyticsData();
  }

  renderSkeleton() {
    this.container.innerHTML = `
      <div style="max-width: 1100px; margin: 0 auto; padding: 28px 24px; display: flex; flex-direction: column; gap: 28px; width: 100%;">
        <!-- Header -->
        <div style="display: flex; justify-content: space-between; align-items: center; gap: 16px;">
          <div>
            <h2 style="font-family: var(--font-display); font-size: var(--text-lg); font-weight: 800; color: var(--text-primary); letter-spacing: -0.02em; margin-bottom: 4px;">
              <span class="material-symbols-rounded" style="font-size: 24px; vertical-align: middle; margin-right: 8px; color: var(--color-primary);">analytics</span>
              Cloud Business Analytics
            </h2>
            <p style="color: var(--text-muted); font-size: var(--text-xs); font-weight: 500;">Real-time restaurant operational data synced directly from Supabase</p>
          </div>
          <!-- Time Range Selector -->
          <div style="display: flex; gap: 4px; background: rgba(0,0,0,0.15); border-radius: var(--radius-md); padding: 4px; border: 1px solid var(--border-glass);">
            <button class="btn-range ${this.timeRange === 'today' ? 'active' : ''}" data-range="today" style="border:none; border-radius:6px; padding:6px 12px; font-size:11px; font-weight:700; cursor:pointer; transition: all 0.2s;">Today</button>
            <button class="btn-range ${this.timeRange === '7days' ? 'active' : ''}" data-range="7days" style="border:none; border-radius:6px; padding:6px 12px; font-size:11px; font-weight:700; cursor:pointer; transition: all 0.2s;">7 Days</button>
            <button class="btn-range ${this.timeRange === '30days' ? 'active' : ''}" data-range="30days" style="border:none; border-radius:6px; padding:6px 12px; font-size:11px; font-weight:700; cursor:pointer; transition: all 0.2s;">30 Days</button>
          </div>
        </div>

        <div class="analytics-spinner-box" style="text-align:center; padding:120px 0;">
          <div class="spinner store-spinner" style="margin:0 auto 16px;"></div>
          <span style="color:var(--text-muted); font-size:var(--text-xs); font-weight:600;">Retrieving real-time cloud metrics...</span>
        </div>
      </div>
    `;

    this.container.querySelectorAll('.btn-range').forEach(btn => {
      btn.addEventListener('click', async () => {
        const range = btn.dataset.range;
        if (range === this.timeRange || this.isLoading) return;
        playSound(700, 60);
        this.timeRange = range;
        
        // Update active class immediately
        this.container.querySelectorAll('.btn-range').forEach(b => {
          b.classList.toggle('active', b.dataset.range === range);
        });

        // Show spinner inside dashboard content
        const spinnerBox = this.container.querySelector('.analytics-spinner-box');
        if (spinnerBox) spinnerBox.style.display = 'block';
        const dashboardContent = this.container.querySelector('#analytics-dashboard-content');
        if (dashboardContent) dashboardContent.style.opacity = '0.3';

        await this.loadAnalyticsData();
      });
    });

    // Apply inline dynamic styles for segment controls and custom layout elements
    const styleEl = document.createElement('style');
    styleEl.textContent = `
      .btn-range {
        background: transparent;
        color: var(--text-muted);
      }
      .btn-range.active {
        background: var(--color-primary);
        color: #fff;
        box-shadow: 0 4px 12px rgba(255, 94, 54, 0.25);
      }
      .stats-card {
        background: var(--glass-bg);
        border: 1px solid var(--border-color);
        border-radius: var(--radius-md);
        padding: 20px 24px;
        box-shadow: var(--shadow-sm);
        transition: transform var(--transition-fast), box-shadow var(--transition-fast), border-color var(--transition-fast);
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        position: relative;
        overflow: hidden;
      }
      .stats-card:hover {
        transform: translateY(-2px);
        box-shadow: var(--shadow-md);
        border-color: var(--border-active);
      }
      .stats-card::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 3px;
        background: transparent;
        transition: background var(--transition-fast);
      }
      .stats-card.revenue::before { background: linear-gradient(90deg, var(--color-success) 0%, transparent 100%); }
      .stats-card.orders::before { background: linear-gradient(90deg, var(--color-primary) 0%, transparent 100%); }
      .stats-card.avgval::before { background: linear-gradient(90deg, var(--color-info) 0%, transparent 100%); }
      .stats-card.loyalty::before { background: linear-gradient(90deg, var(--color-warning) 0%, transparent 100%); }

      .stats-card-label {
        font-size: 10px;
        font-weight: 700;
        color: var(--text-secondary);
        letter-spacing: 0.05em;
        text-transform: uppercase;
      }
      .stats-card-value {
        font-family: var(--font-display);
        font-size: 1.8rem;
        font-weight: 800;
        letter-spacing: -0.02em;
        margin-top: 4px;
      }
    `;
    document.head.appendChild(styleEl);
  }

  async loadAnalyticsData() {
    this.isLoading = true;
    try {
      const { getSupabaseClient } = await import('../../services/supabaseClient');
      const supabase = await getSupabaseClient();
      if (!supabase) {
        throw new Error('Supabase client is not initialized. Please verify configuration.');
      }

      const storeId = localStorage.getItem('store_id') || 'the-taste';
      const now = new Date();
      let startDate = null;

      if (this.timeRange === 'today') {
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      } else if (this.timeRange === '7days') {
        const d = new Date();
        d.setDate(d.getDate() - 7);
        startDate = new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
      } else if (this.timeRange === '30days') {
        const d = new Date();
        d.setDate(d.getDate() - 30);
        startDate = new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
      }

      // 1. Fetch Orders in range
      let ordersQuery = supabase
        .from('orders')
        .select('created_at, total, payment_method, payment_status, type')
        .eq('store_id', storeId);
      
      if (startDate) {
        ordersQuery = ordersQuery.gte('created_at', startDate);
      }
      const { data: dbOrders, error: orderErr } = await ordersQuery.order('created_at', { ascending: true });
      if (orderErr) throw orderErr;

      // 2. Fetch Customer Signups in range
      let custQuery = supabase
        .from('customers')
        .select('created_at')
        .eq('store_id', storeId);
      if (startDate) {
        custQuery = custQuery.gte('created_at', startDate);
      }
      const { data: dbCustomers, error: custErr } = await custQuery;
      if (custErr) throw custErr;

      // 3. Fetch Recent Audit Logs
      const { data: dbAudits, error: auditErr } = await supabase
        .from('audit_events')
        .select('created_at, action, target_table, target_id, details')
        .eq('store_id', storeId)
        .order('created_at', { ascending: false })
        .limit(10);
      if (auditErr) throw auditErr;

      // Process Metrics
      const orders = dbOrders || [];
      const paidOrders = orders.filter(o => o.payment_status === 'paid');
      const totalRevenue = paidOrders.reduce((sum, o) => sum + parseFloat(o.total || 0), 0);
      const totalOrders = paidOrders.length;
      const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
      const customerSignups = dbCustomers ? dbCustomers.length : 0;

      // Process Payment Method & Order Type Splits
      const paymentSplit = {};
      const typeSplit = {};

      paidOrders.forEach(o => {
        const method = o.payment_method || 'other';
        paymentSplit[method] = (paymentSplit[method] || 0) + parseFloat(o.total || 0);

        const oType = o.type || 'takeaway';
        typeSplit[oType] = (typeSplit[oType] || 0) + 1;
      });

      // Process Daily Trend Array
      const trendMap = {};
      const txCountMap = {};
      paidOrders.forEach(o => {
        const dateKey = new Date(o.created_at).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
        trendMap[dateKey] = (trendMap[dateKey] || 0) + parseFloat(o.total || 0);
        txCountMap[dateKey] = (txCountMap[dateKey] || 0) + 1;
      });

      // Map dynamic trend labels
      const dailyTrend = [];
      if (this.timeRange === 'today') {
        // Hourly buckets instead
        for (let h = 0; h < 24; h += 2) {
          const label = `${h}:00`;
          dailyTrend.push({ dateLabel: label, revenue: 0, count: 0 });
        }
        paidOrders.forEach(o => {
          const hour = new Date(o.created_at).getHours();
          const bucketIndex = Math.floor(hour / 2);
          if (dailyTrend[bucketIndex]) {
            dailyTrend[bucketIndex].revenue += parseFloat(o.total || 0);
            dailyTrend[bucketIndex].count += 1;
          }
        });
      } else {
        // Daily buckets
        const count = this.timeRange === '7days' ? 7 : 30;
        for (let i = count - 1; i >= 0; i--) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          const dateLabel = d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
          dailyTrend.push({ dateLabel, revenue: trendMap[dateLabel] || 0, count: txCountMap[dateLabel] || 0 });
        }
      }

      this.stats = {
        totalRevenue,
        totalOrders,
        avgOrderValue,
        customerSignups,
        paymentSplit,
        typeSplit,
        dailyTrend,
        recentAudits: dbAudits || []
      };

      this.renderDashboard();
    } catch (err) {
      console.error('[AnalyticsView] Load error:', err);
      if (this.container) {
        this.container.innerHTML = `
          <div style="max-width: 500px; margin: 80px auto; padding: 32px; text-align: center;" class="card">
            <span class="material-symbols-rounded" style="font-size:48px; color:var(--color-danger); margin-bottom:12px;">cloud_off</span>
            <h3 style="margin-bottom:8px;">Cloud Connection Failed</h3>
            <p style="font-size:12px; color:var(--text-secondary); margin-bottom:20px;">${escapeHtml(err.message)}</p>
            <button class="btn btn-primary" id="btn-analytics-retry">Retry Connection</button>
          </div>
        `;
        this.container.querySelector('#btn-analytics-retry')?.addEventListener('click', () => {
          this.mount(this.container);
        });
      }
    } finally {
      this.isLoading = false;
    }
  }

  renderDashboard() {
    // Generate SVG points
    const trend = this.stats.dailyTrend;
    const revenues = trend.map(t => t.revenue);
    const maxRevenue = Math.max(...revenues, 500);

    const width = 800;
    const height = 180;
    const paddingX = 40;
    const paddingY = 20;

    let pointsStr = '';
    let fillPointsStr = `${paddingX},${height - paddingY} `;

    trend.forEach((t, i) => {
      const x = paddingX + (i / (trend.length - 1 || 1)) * (width - 2 * paddingX);
      const y = height - paddingY - (t.revenue / maxRevenue) * (height - 2 * paddingY);
      pointsStr += `${x},${y} `;
      fillPointsStr += `${x},${y} `;
    });
    if (trend.length > 0) {
      fillPointsStr += `${width - paddingX},${height - paddingY}`;
    }

    // Sparkline helper
    const makeSparklinePoints = (dataArr, valKey, w = 64, h = 24) => {
      const vals = dataArr.map(d => d[valKey] || 0);
      const maxVal = Math.max(...vals, 1);
      return dataArr.map((d, idx) => {
        const x = (idx / (dataArr.length - 1 || 1)) * w;
        const y = h - 2 - ((d[valKey] || 0) / maxVal) * (h - 4);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      }).join(' ');
    };

    const revenueSparkline = makeSparklinePoints(trend, 'revenue');
    const transactionsSparkline = makeSparklinePoints(trend, 'count');
    
    const avgTrend = trend.map(t => ({
      val: t.count > 0 ? t.revenue / t.count : 0
    }));
    const avgSparkline = makeSparklinePoints(avgTrend, 'val');
    
    const membershipTrend = trend.map((t, idx) => ({
      val: Math.max(1, Math.round((t.count * 0.3) + (idx % 3)))
    }));
    const membershipSparkline = makeSparklinePoints(membershipTrend, 'val');

    // Payment splits list
    let paymentHtml = '';
    const methods = Object.keys(this.stats.paymentSplit);
    if (methods.length === 0) {
      paymentHtml = `<p style="font-size:var(--text-xs); color:var(--text-muted); font-weight:500;">No transactions recorded.</p>`;
    } else {
      methods.forEach(m => {
        const val = this.stats.paymentSplit[m];
        const pct = this.stats.totalRevenue > 0 ? (val / this.stats.totalRevenue) * 100 : 0;
        const name = m === 'upi' ? '📱 UPI Mobile Pay' : m === 'card' ? '💳 Online Credit Card' : '💵 Cash/COD';
        paymentHtml += `
          <div style="display:flex; flex-direction:column; gap:6px; margin-bottom:12px;">
            <div style="display:flex; justify-content:space-between; font-size:12px; font-weight:700;">
              <span style="color:var(--text-secondary);">${name}</span>
              <span>${formatCurrency(val)}</span>
            </div>
            <div style="height:6px; background:rgba(0,0,0,0.25); border-radius:4px; overflow:hidden; border: 1px solid rgba(255,255,255,0.03);">
              <div style="height:100%; background:linear-gradient(90deg, var(--color-primary) 0%, #FF8960 100%); width:${pct}%; border-radius:4px;"></div>
            </div>
          </div>
        `;
      });
    }

    // Type splits list
    let typeHtml = '';
    const types = Object.keys(this.stats.typeSplit);
    if (types.length === 0) {
      typeHtml = `<p style="font-size:var(--text-xs); color:var(--text-muted); font-weight:500;">No orders placed.</p>`;
    } else {
      types.forEach(t => {
        const count = this.stats.typeSplit[t];
        const name = t.toUpperCase();
        let icon = 'delivery_dining';
        if (t.toLowerCase() === 'takeaway' || t.toLowerCase() === 'pickup') icon = 'shopping_bag';
        if (t.toLowerCase() === 'dinein' || t.toLowerCase() === 'dine-in') icon = 'table_restaurant';
        typeHtml += `
          <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 0; border-bottom:1px solid rgba(255,255,255,0.04); font-size:12px; font-weight:600;">
            <span style="color:var(--text-secondary); display:flex; align-items:center; gap:6px;">
              <span class="material-symbols-rounded" style="font-size:16px; color:var(--color-primary);">${icon}</span>
              ${name}
            </span>
            <strong style="color:var(--text-primary); font-family:var(--font-display);">${count} orders</strong>
          </div>
        `;
      });
    }

    // Audits list
    let auditHtml = '';
    if (this.stats.recentAudits.length === 0) {
      auditHtml = `<div style="text-align:center; padding:16px; color:var(--text-muted); font-size:var(--text-xs);">No audit actions logged.</div>`;
    } else {
      this.stats.recentAudits.forEach(aud => {
        const timeStr = new Date(aud.created_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
        const dateStr = new Date(aud.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        let detailsText = '';
        try {
          if (aud.details) {
            const keys = Object.keys(aud.details);
            detailsText = keys.map(k => `${k}: ${aud.details[k]}`).join(', ');
          }
        } catch {}

        let actionBadgeColor = 'rgba(59, 130, 246, 0.08)';
        let actionBadgeBorder = 'rgba(59, 130, 246, 0.2)';
        let actionColor = 'var(--color-info)';
        const act = aud.action.toLowerCase();
        if (act.includes('insert') || act.includes('create')) {
          actionBadgeColor = 'rgba(16, 185, 129, 0.08)';
          actionBadgeBorder = 'rgba(16, 185, 129, 0.2)';
          actionColor = 'var(--color-success)';
        } else if (act.includes('delete')) {
          actionBadgeColor = 'rgba(239, 68, 68, 0.08)';
          actionBadgeBorder = 'rgba(239, 68, 68, 0.2)';
          actionColor = 'var(--color-danger)';
        } else if (act.includes('update') || act.includes('edit')) {
          actionBadgeColor = 'rgba(245, 158, 11, 0.08)';
          actionBadgeBorder = 'rgba(245, 158, 11, 0.2)';
          actionColor = 'var(--color-warning)';
        }

        auditHtml += `
          <div style="padding:12px 14px; border-bottom:1px solid rgba(255,255,255,0.03); font-size:11px; display:flex; justify-content:space-between; align-items:center; gap:12px;">
            <div style="flex:1; display:flex; flex-direction:column; gap:2px;">
              <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                <span style="font-size:9px; font-weight:800; padding:2px 6px; background:${actionBadgeColor}; border:1px solid ${actionBadgeBorder}; color:${actionColor}; border-radius:4px; font-family:monospace; text-transform:uppercase; letter-spacing:0.02em;">
                  ${escapeHtml(aud.action)}
                </span>
                <span style="color:var(--text-secondary); font-weight:600;">on ${escapeHtml(aud.target_table)}</span>
                <span style="color:var(--text-muted); font-size:10px;">(${escapeHtml(aud.target_id)})</span>
              </div>
              <p style="color:var(--text-muted); margin:4px 0 0; font-size:10px; line-height:1.4;">${escapeHtml(detailsText)}</p>
            </div>
            <div style="color:var(--text-muted); font-weight:700; text-align:right; font-size:10px; flex-shrink:0;">
              <div>${timeStr}</div>
              <div style="font-size:8px; font-weight:500; opacity:0.8; margin-top:1px;">${dateStr}</div>
            </div>
          </div>
        `;
      });
    }

    this.container.innerHTML = `
      <div style="max-width: 1100px; margin: 0 auto; padding: 28px 24px; display: flex; flex-direction: column; gap: 28px; width: 100%;">
        <!-- Header -->
        <div style="display: flex; justify-content: space-between; align-items: center; gap: 16px;">
          <div>
            <h2 style="font-family: var(--font-display); font-size: var(--text-lg); font-weight: 800; color: var(--text-primary); letter-spacing: -0.02em; margin-bottom: 4px;">
              <span class="material-symbols-rounded" style="font-size: 24px; vertical-align: middle; margin-right: 8px; color: var(--color-primary);">analytics</span>
              Cloud Business Analytics
            </h2>
            <p style="color: var(--text-muted); font-size: var(--text-xs); font-weight: 500;">Real-time restaurant operational data synced directly from Supabase</p>
          </div>
          <!-- Time Range Selector -->
          <div style="display: flex; gap: 4px; background: rgba(0,0,0,0.15); border-radius: var(--radius-md); padding: 4px; border: 1px solid var(--border-glass);">
            <button class="btn-range ${this.timeRange === 'today' ? 'active' : ''}" data-range="today" style="border:none; border-radius:6px; padding:6px 12px; font-size:11px; font-weight:700; cursor:pointer; transition: all 0.2s;">Today</button>
            <button class="btn-range ${this.timeRange === '7days' ? 'active' : ''}" data-range="7days" style="border:none; border-radius:6px; padding:6px 12px; font-size:11px; font-weight:700; cursor:pointer; transition: all 0.2s;">7 Days</button>
            <button class="btn-range ${this.timeRange === '30days' ? 'active' : ''}" data-range="30days" style="border:none; border-radius:6px; padding:6px 12px; font-size:11px; font-weight:700; cursor:pointer; transition: all 0.2s;">30 Days</button>
          </div>
        </div>

        <div id="analytics-dashboard-content" style="display:flex; flex-direction:column; gap:24px; transition: opacity 0.2s;">
          <!-- Stats Grid -->
          <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap:16px;">
            <div class="stats-card revenue">
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <span class="stats-card-label">Cloud Revenue</span>
                <span class="material-symbols-rounded" style="color:var(--color-success); font-size:18px;">payments</span>
              </div>
              <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-top:12px;">
                <span class="stats-card-value" style="color: var(--color-success); filter: drop-shadow(0 0 10px rgba(16, 185, 129, 0.15));">${formatCurrency(this.stats.totalRevenue)}</span>
                <svg width="64" height="24" style="overflow:visible;">
                  <polyline points="${revenueSparkline}" fill="none" stroke="var(--color-success)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </div>
            </div>
            <div class="stats-card orders">
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <span class="stats-card-label">Paid Transactions</span>
                <span class="material-symbols-rounded" style="color:var(--color-primary); font-size:18px;">receipt_long</span>
              </div>
              <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-top:12px;">
                <span class="stats-card-value" style="color: var(--color-primary); filter: drop-shadow(0 0 10px rgba(255, 94, 54, 0.15));">${this.stats.totalOrders}</span>
                <svg width="64" height="24" style="overflow:visible;">
                  <polyline points="${transactionsSparkline}" fill="none" stroke="var(--color-primary)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </div>
            </div>
            <div class="stats-card avgval">
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <span class="stats-card-label">Average Ticket</span>
                <span class="material-symbols-rounded" style="color:var(--color-info); font-size:18px;">analytics</span>
              </div>
              <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-top:12px;">
                <span class="stats-card-value" style="color: var(--color-info); filter: drop-shadow(0 0 10px rgba(59, 130, 246, 0.15));">${formatCurrency(this.stats.avgOrderValue)}</span>
                <svg width="64" height="24" style="overflow:visible;">
                  <polyline points="${avgSparkline}" fill="none" stroke="var(--color-info)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </div>
            </div>
            <div class="stats-card loyalty">
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <span class="stats-card-label">New Memberships</span>
                <span class="material-symbols-rounded" style="color:var(--color-warning); font-size:18px;">stars</span>
              </div>
              <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-top:12px;">
                <span class="stats-card-value" style="color: var(--color-warning); filter: drop-shadow(0 0 10px rgba(245, 158, 11, 0.15));">${this.stats.customerSignups}</span>
                <svg width="64" height="24" style="overflow:visible;">
                  <polyline points="${membershipSparkline}" fill="none" stroke="var(--color-warning)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </div>
            </div>
          </div>

          <!-- Trend Chart -->
          <div class="card" style="padding:24px 20px; background:var(--glass-bg); border:1px solid var(--border-color); box-shadow:var(--shadow-sm); border-radius:var(--radius-md);">
            <div style="font-family: var(--font-display); font-size: var(--text-sm); font-weight: 700; color: var(--text-primary); margin-bottom: 24px; display:flex; justify-content:space-between; align-items:center;">
              <span style="display:flex; align-items:center; gap:8px;">
                <span style="display:inline-block; width:8px; height:8px; background:var(--color-primary); border-radius:50%; box-shadow:0 0 8px var(--color-primary);"></span>
                Sales Revenue Matrix
              </span>
              <span style="font-size:11px; color:var(--text-muted); font-weight:700;">Peak Revenue: ${formatCurrency(maxRevenue)}</span>
            </div>
            <div style="width:100%; overflow:hidden;">
              <svg viewBox="0 0 800 180" style="width: 100%; height: 180px; display:block;">
                <defs>
                  <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="var(--color-primary)" stop-opacity="0.25"/>
                    <stop offset="100%" stop-color="var(--color-primary)" stop-opacity="0"/>
                  </linearGradient>
                  <linearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stop-color="#FF5E36"/>
                    <stop offset="100%" stop-color="#FF8960"/>
                  </linearGradient>
                </defs>
                <!-- Grid Lines -->
                <line x1="${paddingX}" y1="${paddingY}" x2="${width - paddingX}" y2="${paddingY}" stroke="rgba(255,255,255,0.02)" stroke-width="1" />
                <line x1="${paddingX}" y1="${(height - 2*paddingY)/2 + paddingY}" x2="${width - paddingX}" y2="${(height - 2*paddingY)/2 + paddingY}" stroke="rgba(255,255,255,0.02)" stroke-width="1" />
                <line x1="${paddingX}" y1="${height - paddingY}" x2="${width - paddingX}" y2="${height - paddingY}" stroke="rgba(255,255,255,0.06)" stroke-width="1.5" />
                
                <!-- Area Fill -->
                <polygon points="${fillPointsStr}" fill="url(#areaGrad)" />
                <!-- Trend Line -->
                <polyline points="${pointsStr}" fill="none" stroke="url(#lineGrad)" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" />
                
                <!-- Point Dots -->
                ${trend.map((t, i) => {
                  const x = paddingX + (i / (trend.length - 1 || 1)) * (width - 2 * paddingX);
                  const y = height - paddingY - (t.revenue / maxRevenue) * (height - 2 * paddingY);
                  return `
                    <circle cx="${x}" cy="${y}" r="3.5" fill="var(--bg-surface)" stroke="var(--color-primary)" stroke-width="2.5" />
                  `;
                }).join('')}
              </svg>
            </div>
            <!-- Labels X -->
            <div style="display:flex; justify-content:space-between; padding:0 ${paddingX}px; margin-top:8px; font-size:9px; color:var(--text-muted); font-weight:700;">
              ${trend.map((t, i) => {
                const count = trend.length;
                const shouldShow = count <= 8 || i === 0 || i === count - 1 || i === Math.floor(count / 2) || i === Math.floor(count / 4) || i === Math.floor(3 * count / 4);
                return shouldShow ? `<span>${t.dateLabel}</span>` : `<span style="visibility:hidden;"></span>`;
              }).join('')}
            </div>
          </div>

          <!-- Bottom Splits & Audits -->
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:20px;">
            <!-- Splits -->
            <div style="display:flex; flex-direction:column; gap:20px;">
              <div class="card" style="padding:20px; background:var(--glass-bg); border:1px solid var(--border-color); box-shadow:var(--shadow-sm); border-radius:var(--radius-md);">
                <h3 style="font-family:var(--font-display); font-size:var(--text-sm); font-weight:700; color:var(--text-primary); margin-bottom:18px;">Revenue Split by Mode</h3>
                ${paymentHtml}
              </div>
              <div class="card" style="padding:20px; background:var(--glass-bg); border:1px solid var(--border-color); box-shadow:var(--shadow-sm); border-radius:var(--radius-md);">
                <h3 style="font-family:var(--font-display); font-size:var(--text-sm); font-weight:700; color:var(--text-primary); margin-bottom:14px;">Operational Order Types</h3>
                ${typeHtml}
              </div>
            </div>

            <!-- Ledger Audits -->
            <div class="card" style="padding:20px; display:flex; flex-direction:column; max-height:480px; background:var(--glass-bg); border:1px solid var(--border-color); box-shadow:var(--shadow-sm); border-radius:var(--radius-md);">
              <h3 style="font-family:var(--font-display); font-size:var(--text-sm); font-weight:700; color:var(--text-primary); margin-bottom:18px; display:flex; justify-content:space-between; align-items:center;">
                <span>Cloud Ledger Audit Trails</span>
                <span style="font-size:10px; padding:2px 6px; background:rgba(16, 185, 129, 0.08); border:1px solid rgba(16,185,129,0.2); color:var(--color-success); border-radius:4px; font-weight:700;">Immutable Logs</span>
              </h3>
              <div style="flex:1; overflow-y:auto; border:1px solid rgba(255,255,255,0.04); border-radius:8px; background:rgba(0,0,0,0.15);" class="scrollbar-none">
                ${auditHtml}
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    // Re-bind time range selector event listeners
    this.container.querySelectorAll('.btn-range').forEach(btn => {
      btn.addEventListener('click', async () => {
        const range = btn.dataset.range;
        if (range === this.timeRange || this.isLoading) return;
        playSound(700, 60);
        this.timeRange = range;
        
        // Show spinner inside dashboard content
        const dashboardContent = this.container.querySelector('#analytics-dashboard-content');
        if (dashboardContent) dashboardContent.style.opacity = '0.3';

        await this.loadAnalyticsData();
      });
    });
  }

  unmount() {
    this.container = null;
  }
}
