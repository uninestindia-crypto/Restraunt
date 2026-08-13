/**
 * ═══════════════════════════════════════════════════
 *  NextGenOS Restaurant Operating System
 *  Module: Smart Analytics Dashboard
 *  Version: 2.0.0
 *  © 2026 NextGenOS. All Rights Reserved.
 *  This software is proprietary and confidential.
 * ═══════════════════════════════════════════════════
 */

import { analyticsService } from '../../services/analytics';
import { formatCurrency, showToast, playSound, escapeHtml } from '../../utils/helpers';

export class AnalyticsDashboard {
  // Fields these methods assign. Type-only: `declare` emits nothing, so the
  // runtime shape of the class is unchanged.
  declare app: any;
  declare container: any;
  declare period: any;

  constructor(app) {
    this.app = app;
    this.container = null;
    this.period = 0; // 0=today, 6=week, 29=month
  }

  async mount(container) {
    this.container = container;
    this.render();
    this.bindEvents();
    await this.loadData();
  }

  render() {
    this.container.innerHTML = `
      <div style="flex:1;display:flex;flex-direction:column;height:100%;overflow:hidden;background:var(--bg-primary);">
        <!-- Header -->
        <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 24px;background:var(--glass-bg);backdrop-filter:blur(20px);border-bottom:1px solid var(--border-glass);z-index:10;flex-wrap:wrap;gap:12px;">
          <div style="display:flex;align-items:center;gap:10px;">
            <span class="material-symbols-rounded" style="color: var(--color-primary-on-surface);font-size:24px;filter:drop-shadow(0 0 8px rgba(var(--color-primary-rgb),0.45));">analytics</span>
            <h2 style="font-family:'Plus Jakarta Sans',sans-serif;font-size:var(--text-lg);font-weight:800;color:var(--text-primary);letter-spacing:-0.02em;margin:0;">Smart Analytics</h2>
          </div>
          <div style="display:flex;gap:6px;" id="analytics-tabs">
            <button class="tab analytics-period-tab active" data-days="0" style="padding:6px 14px;border-radius:8px;font-size:0.75rem;font-weight:700;font-family:'Plus Jakarta Sans',sans-serif;cursor:pointer;transition:all 0.2s;background:var(--gradient-primary);color:white;border:none;">Today</button>
            <button class="tab analytics-period-tab" data-days="6" style="padding:6px 14px;border-radius:8px;font-size:0.75rem;font-weight:700;font-family:'Plus Jakarta Sans',sans-serif;cursor:pointer;transition:all 0.2s;background:rgba(255,255,255,0.03);color:var(--text-secondary);border:1px solid var(--border-glass);">This Week</button>
            <button class="tab analytics-period-tab" data-days="29" style="padding:6px 14px;border-radius:8px;font-size:0.75rem;font-weight:700;font-family:'Plus Jakarta Sans',sans-serif;cursor:pointer;transition:all 0.2s;background:rgba(255,255,255,0.03);color:var(--text-secondary);border:1px solid var(--border-glass);">This Month</button>
          </div>
        </div>

        <!-- Dashboard Content -->
        <div style="flex:1;overflow-y:auto;padding:20px 24px;display:flex;flex-direction:column;gap:20px;max-width:1100px;margin:0 auto;width:100%;">
          <!-- KPI Cards -->
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;" id="analytics-kpis"></div>

          <!-- Charts Row -->
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;" id="analytics-charts">
            <!-- Revenue Trend -->
            <div class="card card-glass" style="padding:20px;background:rgba(255,255,255,0.01);border:1px solid var(--border-glass);border-radius:16px;">
              <div style="font-family:'Plus Jakarta Sans',sans-serif;font-size:var(--text-sm);font-weight:700;color:var(--text-primary);margin-bottom:16px;">Revenue Trend (7 Days)</div>
              <canvas id="revenue-chart" width="400" height="200" style="width:100%;height:200px;"></canvas>
            </div>
            <!-- Top Items -->
            <div class="card card-glass" style="padding:20px;background:rgba(255,255,255,0.01);border:1px solid var(--border-glass);border-radius:16px;">
              <div style="font-family:'Plus Jakarta Sans',sans-serif;font-size:var(--text-sm);font-weight:700;color:var(--text-primary);margin-bottom:16px;">🏆 Top Sellers</div>
              <div id="top-items-list" style="display:flex;flex-direction:column;gap:10px;"></div>
            </div>
          </div>

          <!-- Payment & Order Type -->
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;" id="analytics-breakdowns">
            <div class="card card-glass" style="padding:20px;background:rgba(255,255,255,0.01);border:1px solid var(--border-glass);border-radius:16px;">
              <div style="font-family:'Plus Jakarta Sans',sans-serif;font-size:var(--text-sm);font-weight:700;color:var(--text-primary);margin-bottom:16px;">Payment Methods</div>
              <div id="payment-breakdown" style="display:flex;flex-direction:column;gap:12px;"></div>
            </div>
            <div class="card card-glass" style="padding:20px;background:rgba(255,255,255,0.01);border:1px solid var(--border-glass);border-radius:16px;">
              <div style="font-family:'Plus Jakarta Sans',sans-serif;font-size:var(--text-sm);font-weight:700;color:var(--text-primary);margin-bottom:16px;">Order Types</div>
              <div id="order-type-split" style="display:flex;flex-direction:column;gap:12px;"></div>
            </div>
          </div>

          <!-- AI Insight -->
          <div class="card" style="padding:20px;background:rgba(108,92,231,0.02);border:1px solid rgba(108,92,231,0.1);border-radius:16px;" id="ai-insight-card">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
              <span style="font-size:16px;">💡</span>
              <span style="font-family:'Plus Jakarta Sans',sans-serif;font-size:var(--text-xs);font-weight:700;color:var(--nextgenos-purple-on-surface);letter-spacing:0.06em;text-transform:uppercase;">AI Insight</span>
            </div>
            <div style="color:var(--text-secondary);font-size:var(--text-sm);line-height:1.6;font-weight:500;" id="ai-insight-text">Analyzing your data...</div>
          </div>

          <!-- Reports & Downloads -->
          <div class="card card-glass" style="padding:20px;background:rgba(255,255,255,0.01);border:1px solid var(--border-glass);border-radius:16px;display:flex;flex-direction:column;gap:16px;">
            <div style="font-family:'Plus Jakarta Sans',sans-serif;font-size:var(--text-sm);font-weight:700;color:var(--text-primary);display:flex;align-items:center;gap:8px;">
              <span class="material-symbols-rounded" style="color: var(--color-primary-on-surface);font-size:20px;">table_view</span>
              <span>Business Reports & CSV Export</span>
            </div>
            <p style="font-size:var(--text-xs);color:var(--text-secondary);line-height:1.5;margin:0;font-weight:500;">
              Generate launch-safe CSV reports containing Summary KPIs, complete Order Logs, and granular Item Sales Analysis.
            </p>
            
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;">
              <button class="btn btn-secondary report-download-btn" data-type="daily" style="
                font-family:'Plus Jakarta Sans',sans-serif;
                font-weight:700;
                font-size:var(--text-xs);
                min-height:42px;
                display:inline-flex;
                align-items:center;
                justify-content:center;
                gap:8px;
                border:1px solid var(--border-glass);
                background:rgba(255,255,255,0.02);
                border-radius:12px;
                cursor:pointer;
                transition:all 0.2s;
              ">
                <span class="material-symbols-rounded" style="font-size:18px;color:var(--color-success-on-surface);">today</span>
                Download Today's Report
              </button>
              
              <button class="btn btn-secondary report-download-btn" data-type="weekly" style="
                font-family:'Plus Jakarta Sans',sans-serif;
                font-weight:700;
                font-size:var(--text-xs);
                min-height:42px;
                display:inline-flex;
                align-items:center;
                justify-content:center;
                gap:8px;
                border:1px solid var(--border-glass);
                background:rgba(255,255,255,0.02);
                border-radius:12px;
                cursor:pointer;
                transition:all 0.2s;
              ">
                <span class="material-symbols-rounded" style="font-size:18px;color: var(--color-primary-on-surface);">date_range</span>
                Download Weekly Report
              </button>
              
              <button class="btn btn-secondary report-download-btn" data-type="monthly" style="
                font-family:'Plus Jakarta Sans',sans-serif;
                font-weight:700;
                font-size:var(--text-xs);
                min-height:42px;
                display:inline-flex;
                align-items:center;
                justify-content:center;
                gap:8px;
                border:1px solid var(--border-glass);
                background:rgba(255,255,255,0.02);
                border-radius:12px;
                cursor:pointer;
                transition:all 0.2s;
              ">
                <span class="material-symbols-rounded" style="font-size:18px;color:var(--color-info);">calendar_month</span>
                Download Monthly Report
              </button>
            </div>
            
            <div style="font-size:10px;color:var(--text-muted);display:flex;align-items:center;gap:6px;" id="report-drive-upload-status"></div>
          </div>
        </div>
      </div>

      <style>
        @media (max-width: 768px) {
          #analytics-charts, #analytics-breakdowns { grid-template-columns: 1fr !important; }
        }
      </style>
    `;
  }

  bindEvents() {
    this.container.querySelectorAll('.analytics-period-tab').forEach(btn => {
      btn.addEventListener('click', async () => {
        this.period = parseInt(btn.dataset.days);
        playSound(700, 80);
        this.container.querySelectorAll('.analytics-period-tab').forEach(b => {
          b.style.background = 'rgba(255,255,255,0.03)';
          b.style.color = 'var(--text-secondary)';
          b.style.border = '1px solid var(--border-glass)';
          b.classList.remove('active');
        });
        btn.style.background = 'var(--gradient-primary)';
        btn.style.color = 'white';
        btn.style.border = 'none';
        btn.classList.add('active');
        await this.loadData();
      });
    });

    // Reports download handlers
    this.container.querySelectorAll('.report-download-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        playSound(800, 100);
        const reportType = btn.dataset.type;
        const originalText = btn.innerHTML;
        
        btn.disabled = true;
        btn.innerHTML = `<span class="material-symbols-rounded animate-spin" style="font-size:18px;">sync</span> Generating...`;
        
        try {
          // Dynamic import of reportGenerator
          const { generateDailyReport, generateWeeklyReport, generateMonthlyReport, downloadReport } = await import('../../services/reportGenerator');
          
          let blob;
          let filename = '';
          const now = new Date();
          
          if (reportType === 'daily') {
            const todayStr = now.toISOString().split('T')[0];
            blob = await generateDailyReport(todayStr);
            filename = `Daily_Report_${todayStr}.csv`;
          } else if (reportType === 'weekly') {
            const todayStr = now.toISOString().split('T')[0];
            blob = await generateWeeklyReport(todayStr);
            filename = `Weekly_Report_${todayStr}.csv`;
          } else if (reportType === 'monthly') {
            const month = now.getMonth();
            const year = now.getFullYear();
            blob = await generateMonthlyReport(month, year);
            const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
            filename = `Monthly_Report_${monthNames[month]}_${year}.csv`;
          }
          
          if (blob && filename) {
            // Trigger local download
            downloadReport(blob, filename);
            showToast(`${filename} downloaded!`, 'success');
            
            // Check Google Drive connection and auto-upload toggle
            const driveUpload = await import('../../services/driveUpload');
            const isDriveConnected = driveUpload.isDriveConnected();
            
            const { getSetting } = await import('../../db/database');
            const autoUpload = (await getSetting('autoUploadToDrive')) === 'true';
            
            const statusEl = document.getElementById('report-drive-upload-status');
            if (isDriveConnected && autoUpload) {
              if (statusEl) {
                statusEl.innerHTML = `<span class="material-symbols-rounded animate-spin" style="font-size:12px;color:var(--color-info);">sync</span> Uploading backup to Google Drive...`;
              }
              
              try {
                const uploadResult = await driveUpload.uploadToDrive(blob, filename);
                if (uploadResult.success) {
                  showToast('Backup successfully uploaded to Google Drive! ☁️', 'success');
                  if (statusEl) {
                    statusEl.innerHTML = `✅ Report backed up to Google Drive folder: <strong>TheTaste Reports</strong>`;
                  }
                }
              } catch (uploadErr) {
                console.error('[DriveUpload] Failed to auto-upload report:', uploadErr);
                showToast('Google Drive backup failed: ' + uploadErr.message, 'warning');
                if (statusEl) {
                  statusEl.textContent = `Google Drive upload failed: ${uploadErr.message}`;
                }
              }
            } else if (isDriveConnected) {
              if (statusEl) {
                statusEl.innerHTML = `ℹ️ Google Drive is connected. Enable "Auto-upload" in Settings to automatically sync reports.`;
              }
            }
          }
        } catch (err) {
          console.error('[Reports] Generation failed:', err);
          showToast('Failed to generate report: ' + err.message, 'error');
        } finally {
          btn.disabled = false;
          btn.innerHTML = originalText;
        }
      });
    });
  }

  async loadData() {
    try {
      const [stats, trend, topItems, payments, orderTypes] = await Promise.all([
        analyticsService.getRevenueByPeriod(this.period),
        analyticsService.getRevenueTrend(7),
        analyticsService.getTopItems(this.period, 8),
        analyticsService.getPaymentBreakdown(this.period),
        analyticsService.getOrderTypeSplit(this.period),
      ]);

      let growth = 0;
      try { growth = await analyticsService.getGrowthRate(7, 7); } catch (e) {}

      this.renderKPIs(stats, growth);
      this.renderChart(trend);
      this.renderTopItems(topItems);
      this.renderPayments(payments, stats.revenue);
      this.renderOrderTypes(orderTypes, stats.orders);
      this.renderInsight(stats, topItems, growth);
    } catch (err) {
      console.error('Analytics load error:', err);
    }
  }

  renderKPIs(stats, growth) {
    const container = document.getElementById('analytics-kpis');
    if (!container) return;
    const kpis = [
      { label: "TOTAL REVENUE", value: formatCurrency(stats.revenue), color: 'var(--color-success-on-surface)', glow: 'rgba(var(--color-success-rgb),0.25)' },
      { label: "TOTAL ORDERS", value: stats.orders, color: 'var(--color-primary)', glow: 'rgba(var(--color-primary-rgb),0.25)' },
      { label: "AVG BILL VALUE", value: formatCurrency(stats.avg), color: 'var(--color-info)', glow: 'rgba(var(--color-info-rgb),0.25)' },
      { label: "GROWTH RATE", value: `${growth > 0 ? '+' : ''}${growth.toFixed(1)}%`, color: '#A29BFE', glow: 'rgba(108,92,231,0.25)' },
    ];
    container.innerHTML = kpis.map(k => `
      <div class="card card-glass" style="padding:20px;background:rgba(255,255,255,0.01);border:1px solid var(--border-glass);border-radius:16px;display:flex;flex-direction:column;gap:8px;">
        <div style="font-family:'Plus Jakarta Sans',sans-serif;font-size:0.65rem;color:var(--text-secondary);font-weight:700;letter-spacing:0.06em;text-transform:uppercase;">${k.label}</div>
        <div style="font-family:'Plus Jakarta Sans',sans-serif;font-size:1.8rem;font-weight:800;color:${k.color};line-height:1;letter-spacing:-0.03em;filter:drop-shadow(0 0 10px ${k.glow});">${k.value}</div>
      </div>
    `).join('');
  }

  renderChart(trend) {
    const canvas = document.getElementById('revenue-chart');
    if (!canvas) return;
    const ctx = (canvas as HTMLCanvasElement).getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    (canvas as HTMLCanvasElement).width = rect.width * dpr;
    (canvas as HTMLCanvasElement).height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const W = rect.width, H = rect.height;
    ctx.clearRect(0, 0, W, H);

    if (trend.length === 0) return;

    const maxRev = Math.max(...trend.map(t => t.revenue), 1);
    const padding = { top: 10, right: 10, bottom: 30, left: 10 };
    const chartW = W - padding.left - padding.right;
    const chartH = H - padding.top - padding.bottom;

    const points = trend.map((t, i) => ({
      x: padding.left + (i / (trend.length - 1 || 1)) * chartW,
      y: padding.top + chartH - (t.revenue / maxRev) * chartH,
      label: t.date,
      revenue: t.revenue,
    }));

    // Gradient fill
    const grad = ctx.createLinearGradient(0, padding.top, 0, H - padding.bottom);
    grad.addColorStop(0, 'rgba(255, 107, 53, 0.15)');
    grad.addColorStop(1, 'rgba(255, 107, 53, 0)');
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    points.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
    ctx.lineTo(points[points.length - 1].x, H - padding.bottom);
    ctx.lineTo(points[0].x, H - padding.bottom);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Line
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    points.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
    ctx.strokeStyle = '#FF6B35';
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // Dots + labels
    points.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#FF6B35';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
      ctx.fillStyle = '#0F0F1A';
      ctx.fill();

      ctx.fillStyle = 'rgba(148,163,184,0.6)';
      ctx.font = '10px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(p.label, p.x, H - 8);
    });
  }

  renderTopItems(items) {
    const container = document.getElementById('top-items-list');
    if (!container) return;
    const medals = ['🥇', '🥈', '🥉'];
    container.innerHTML = items.length > 0 ? items.map((item, i) => `
      <div style="display:flex;align-items:center;gap:10px;padding:8px 0;${i < items.length - 1 ? 'border-bottom:1px solid var(--border-glass);' : ''}">
        <span style="font-size:1rem;width:24px;text-align:center;">${medals[i] || `<span style="font-size:0.75rem;color:var(--text-muted);font-weight:700;">${i + 1}</span>`}</span>
        <div style="flex:1;min-width:0;">
          <div style="font-size:var(--text-sm);color:var(--text-primary);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(item.name)}</div>
        </div>
        <div style="text-align:right;flex-shrink:0;">
          <div style="font-size:var(--text-xs);color: var(--color-primary-on-surface);font-weight:700;">${item.qty} sold</div>
          <div style="font-size:0.65rem;color:var(--text-muted);font-weight:500;">${formatCurrency(item.revenue)}</div>
        </div>
      </div>
    `).join('') : '<div style="color:var(--text-muted);font-size:var(--text-xs);padding:20px 0;text-align:center;">No sales data available</div>';
  }

  renderPayments(payments: Record<string, { total: number; count: number }>, totalRevenue) {
    const container = document.getElementById('payment-breakdown');
    if (!container) return;
    const entries = Object.entries(payments);
    container.innerHTML = entries.length > 0 ? entries.map(([method, data]) => {
      const pct = totalRevenue > 0 ? (data.total / totalRevenue * 100).toFixed(0) : 0;
      const icon = method === 'upi' ? '📱' : method === 'cash' ? '💵' : '❓';
      return `
        <div>
          <div style="display:flex;justify-content:space-between;font-size:var(--text-sm);font-weight:600;margin-bottom:6px;">
            <span style="color:var(--text-secondary);">${icon} ${escapeHtml(String(method).toUpperCase())} <span style="color:var(--text-muted);font-size:0.7rem;">(${data.count})</span></span>
            <span style="color:var(--text-primary);font-weight:700;">${formatCurrency(data.total)}</span>
          </div>
          <div style="height:6px;background:rgba(0,0,0,0.25);border-radius:99px;overflow:hidden;">
            <div style="height:100%;background:linear-gradient(90deg,var(--color-primary),#FF8960);width:${pct}%;border-radius:99px;transition:width 0.5s ease;"></div>
          </div>
        </div>
      `;
    }).join('') : '<div style="color:var(--text-muted);font-size:var(--text-xs);text-align:center;">No data</div>';
  }

  renderOrderTypes(types: Record<string, { count: number }>, totalOrders) {
    const container = document.getElementById('order-type-split');
    if (!container) return;
    const icons = { takeaway: '🥡', dinein: '🍽️', delivery: '🛵' };
    const colors = { takeaway: '#FF6B35', dinein: '#10B981', delivery: '#3B82F6' };
    const entries = Object.entries(types);
    container.innerHTML = entries.length > 0 ? entries.map(([type, data]) => {
      const pct = totalOrders > 0 ? (data.count / totalOrders * 100).toFixed(0) : 0;
      return `
        <div>
          <div style="display:flex;justify-content:space-between;font-size:var(--text-sm);font-weight:600;margin-bottom:6px;">
            <span style="color:var(--text-secondary);">${icons[type] || '📦'} ${escapeHtml(type.charAt(0).toUpperCase() + type.slice(1))}</span>
            <span style="color:var(--text-primary);font-weight:700;">${data.count} (${pct}%)</span>
          </div>
          <div style="height:6px;background:rgba(0,0,0,0.25);border-radius:99px;overflow:hidden;">
            <div style="height:100%;background:${colors[type] || '#FF6B35'};width:${pct}%;border-radius:99px;transition:width 0.5s ease;"></div>
          </div>
        </div>
      `;
    }).join('') : '<div style="color:var(--text-muted);font-size:var(--text-xs);text-align:center;">No data</div>';
  }

  renderInsight(stats, topItems, growth) {
    const el = document.getElementById('ai-insight-text');
    if (!el) return;
    let insight = '';
    if (stats.orders === 0) {
      insight = 'No sales data for this period yet. Start taking orders and I\'ll provide smart insights!';
    } else if (growth > 20) {
      insight = `Great performance! Revenue grew ${growth.toFixed(1)}% compared to the previous period. Keep up the momentum!`;
    } else if (growth < -20) {
      insight = `Revenue declined ${Math.abs(growth).toFixed(1)}% compared to last period. Consider running promotions or offers to boost sales.`;
    } else if (topItems.length > 0) {
      insight = `${topItems[0].name} is your star performer with ${topItems[0].qty} units sold. Consider bundling it with complementary items for higher average bills.`;
    } else {
      insight = `Your average bill is ${formatCurrency(stats.avg)}. Try suggesting add-ons at checkout to increase this by 10-15%.`;
    }
    el.textContent = insight;
  }

  unmount() {
    this.container = null;
  }
}
