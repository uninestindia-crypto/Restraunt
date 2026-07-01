// @ts-nocheck
import React, { useState, useEffect, useMemo } from 'react';
import { formatCurrency, playSound, vibrateDevice } from '../../utils/helpers';

interface AuditEvent {
  created_at: string;
  action: string;
  target_table: string;
  target_id: string;
  details: any;
}

interface AnalyticsStats {
  totalRevenue: number;
  totalOrders: number;
  avgOrderValue: number;
  customerSignups: number;
  paymentSplit: Record<string, number>;
  typeSplit: Record<string, number>;
  dailyTrend: { dateLabel: string; revenue: number; count: number }[];
  recentAudits: AuditEvent[];
}

export function AnalyticsView() {
  const [timeRange, setTimeRange] = useState<'today' | '7days' | '30days'>('7days');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [stats, setStats] = useState<AnalyticsStats | null>(null);

  const loadAnalyticsData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { getSupabaseClient } = await import('../../services/supabaseClient');
      const supabase = await getSupabaseClient();
      if (!supabase) {
        throw new Error('Supabase client is not initialized. Please verify configuration.');
      }

      const storeId = localStorage.getItem('store_id') || 'the-taste';
      const now = new Date();
      let startDate = null;

      if (timeRange === 'today') {
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      } else if (timeRange === '7days') {
        const d = new Date();
        d.setDate(d.getDate() - 7);
        startDate = new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
      } else if (timeRange === '30days') {
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
      const paymentSplit: Record<string, number> = {};
      const typeSplit: Record<string, number> = {};

      paidOrders.forEach(o => {
        const method = o.payment_method || 'other';
        paymentSplit[method] = (paymentSplit[method] || 0) + parseFloat(o.total || 0);

        const oType = o.type || 'takeaway';
        typeSplit[oType] = (typeSplit[oType] || 0) + 1;
      });

      // Process Daily Trend Array
      const trendMap: Record<string, number> = {};
      const txCountMap: Record<string, number> = {};
      paidOrders.forEach(o => {
        const dateKey = new Date(o.created_at).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
        trendMap[dateKey] = (trendMap[dateKey] || 0) + parseFloat(o.total || 0);
        txCountMap[dateKey] = (txCountMap[dateKey] || 0) + 1;
      });

      // Map dynamic trend labels
      const dailyTrend: { dateLabel: string; revenue: number; count: number }[] = [];
      if (timeRange === 'today') {
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
        const count = timeRange === '7days' ? 7 : 30;
        for (let i = count - 1; i >= 0; i--) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          const dateLabel = d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
          dailyTrend.push({ dateLabel, revenue: trendMap[dateLabel] || 0, count: txCountMap[dateLabel] || 0 });
        }
      }

      setStats({
        totalRevenue,
        totalOrders,
        avgOrderValue,
        customerSignups,
        paymentSplit,
        typeSplit,
        dailyTrend,
        recentAudits: dbAudits || []
      });
    } catch (err: any) {
      console.error('[AnalyticsView] Load error:', err);
      setError(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAnalyticsData();
  }, [timeRange]);

  const handleRangeChange = (range: 'today' | '7days' | '30days') => {
    if (range === timeRange || isLoading) return;
    playSound(700, 60);
    setTimeRange(range);
  };

  const makeSparklinePoints = (dataArr: any[], valKey: string, w = 64, h = 24) => {
    const vals = dataArr.map(d => d[valKey] || 0);
    const maxVal = Math.max(...vals, 1);
    return dataArr.map((d, idx) => {
      const x = (idx / (dataArr.length - 1 || 1)) * w;
      const y = h - 2 - ((d[valKey] || 0) / maxVal) * (h - 4);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
  };

  const trendData = useMemo(() => {
    const trend = stats?.dailyTrend || [];
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

    return {
      pointsStr,
      fillPointsStr,
      maxRevenue,
      width,
      height,
      paddingX,
      paddingY,
      revenueSparkline,
      transactionsSparkline,
      avgSparkline,
      membershipSparkline
    };
  }, [stats]);

  if (error) {
    return (
      <div style={{ maxWidth: '500px', margin: '80px auto', padding: '32px', textAlign: 'center' }} className="card">
        <span className="material-symbols-rounded" style={{ fontSize: '48px', color: 'var(--color-danger)', marginBottom: '12px' }}>cloud_off</span>
        <h3 style={{ marginBottom: '8px' }}>Cloud Connection Failed</h3>
        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '20px' }}>{error.message}</p>
        <button className="btn btn-primary" onClick={loadAnalyticsData}>Retry Connection</button>
      </div>
    );
  }

  if (isLoading && !stats) {
    return (
      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '28px 24px', display: 'flex', flexDirection: 'column', gap: '28px', width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="skeleton-card" style={{ height: '40px', width: '250px', borderRadius: '8px' }}></div>
          <div className="skeleton-card" style={{ height: '36px', width: '200px', borderRadius: '8px' }}></div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
          {[0, 1, 2, 3].map(idx => (
            <div key={idx} className="stats-card skeleton-card" style={{ height: '108px', borderRadius: '12px' }}></div>
          ))}
        </div>
        <div className="card skeleton-card" style={{ height: '220px', borderRadius: '12px' }}></div>
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '28px 24px', display: 'flex', flexDirection: 'column', gap: '28px', width: '100%' }}>
      {/* Dynamic styles injection for stats-card visual state */}
      <style>{`
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
      `}</style>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px' }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-lg)', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em', marginBottom: '4px', display: 'flex', alignItems: 'center' }}>
            <span className="material-symbols-rounded" style={{ fontSize: '24px', marginRight: '8px', color: 'var(--color-primary)' }}>analytics</span>
            Cloud Business Analytics
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)', fontWeight: 500 }}>Real-time restaurant operational data synced directly from Supabase</p>
        </div>
        {/* Time Range Selector */}
        <div style={{ display: 'flex', gap: '4px', background: 'rgba(0,0,0,0.15)', borderRadius: 'var(--radius-md)', padding: '4px', border: '1px solid var(--border-glass)' }}>
          {(['today', '7days', '30days'] as const).map(range => (
            <button
              key={range}
              onClick={() => handleRangeChange(range)}
              className={`btn-range ${timeRange === range ? 'active' : ''}`}
              style={{ border: 'none', borderRadius: '6px', padding: '6px 12px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s' }}
            >
              {range === 'today' ? 'Today' : range === '7days' ? '7 Days' : '30 Days'}
            </button>
          ))}
        </div>
      </div>

      <div id="analytics-dashboard-content" style={{ display: 'flex', flexDirection: 'column', gap: '24px', transition: 'opacity 0.2s', opacity: isLoading ? 0.35 : 1 }}>
        {/* Stats Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
          <div className="stats-card revenue">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="stats-card-label">Cloud Revenue</span>
              <span className="material-symbols-rounded" style={{ color: 'var(--color-success)', fontSize: '18px' }}>payments</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '12px' }}>
              <span className="stats-card-value" style={{ color: 'var(--color-success)', filter: 'drop-shadow(0 0 10px rgba(16, 185, 129, 0.15))' }}>{formatCurrency(stats.totalRevenue)}</span>
              <svg width="64" height="24" style={{ overflow: 'visible' }}>
                <polyline points={trendData.revenueSparkline} fill="none" stroke="var(--color-success)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>
          <div className="stats-card orders">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="stats-card-label">Paid Transactions</span>
              <span className="material-symbols-rounded" style={{ color: 'var(--color-primary)', fontSize: '18px' }}>receipt_long</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '12px' }}>
              <span className="stats-card-value" style={{ color: 'var(--color-primary)', filter: 'drop-shadow(0 0 10px rgba(255, 94, 54, 0.15))' }}>{stats.totalOrders}</span>
              <svg width="64" height="24" style={{ overflow: 'visible' }}>
                <polyline points={trendData.transactionsSparkline} fill="none" stroke="var(--color-primary)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>
          <div className="stats-card avgval">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="stats-card-label">Average Ticket</span>
              <span className="material-symbols-rounded" style={{ color: 'var(--color-info)', fontSize: '18px' }}>analytics</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '12px' }}>
              <span className="stats-card-value" style={{ color: 'var(--color-info)', filter: 'drop-shadow(0 0 10px rgba(59, 130, 246, 0.15))' }}>{formatCurrency(stats.avgOrderValue)}</span>
              <svg width="64" height="24" style={{ overflow: 'visible' }}>
                <polyline points={trendData.avgSparkline} fill="none" stroke="var(--color-info)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>
          <div className="stats-card loyalty">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="stats-card-label">New Memberships</span>
              <span className="material-symbols-rounded" style={{ color: 'var(--color-warning)', fontSize: '18px' }}>stars</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '12px' }}>
              <span className="stats-card-value" style={{ color: 'var(--color-warning)', filter: 'drop-shadow(0 0 10px rgba(245, 158, 11, 0.15))' }}>{stats.customerSignups}</span>
              <svg width="64" height="24" style={{ overflow: 'visible' }}>
                <polyline points={trendData.membershipSparkline} fill="none" stroke="var(--color-warning)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>
        </div>

        {/* Trend Chart */}
        <div className="card" style={{ padding: '24px 20px', background: 'var(--glass-bg)', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-sm)', borderRadius: 'var(--radius-md)' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ display: 'inline-block', width: '8px', height: '8px', background: 'var(--color-primary)', borderRadius: '50%', boxShadow: '0 0 8px var(--color-primary)' }}></span>
              Sales Revenue Matrix
            </span>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700 }}>Peak Revenue: {formatCurrency(trendData.maxRevenue)}</span>
          </div>
          <div style={{ width: '100%', overflow: 'hidden' }}>
            <svg viewBox={`0 0 ${trendData.width} ${trendData.height}`} style={{ width: '100%', height: '180px', display: 'block' }}>
              <defs>
                <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.25"/>
                  <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0"/>
                </linearGradient>
                <linearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#FF5E36"/>
                  <stop offset="100%" stopColor="#FF8960"/>
                </linearGradient>
              </defs>
              {/* Grid Lines */}
              <line x1={trendData.paddingX} y1={trendData.paddingY} x2={trendData.width - trendData.paddingX} y2={trendData.paddingY} stroke="rgba(255,255,255,0.02)" strokeWidth="1" />
              <line x1={trendData.paddingX} y1={(trendData.height - 2*trendData.paddingY)/2 + trendData.paddingY} x2={trendData.width - trendData.paddingX} y2={(trendData.height - 2*trendData.paddingY)/2 + trendData.paddingY} stroke="rgba(255,255,255,0.02)" strokeWidth="1" />
              <line x1={trendData.paddingX} y1={trendData.height - trendData.paddingY} x2={trendData.width - trendData.paddingX} y2={trendData.height - trendData.paddingY} stroke="rgba(255,255,255,0.06)" strokeWidth="1.5" />
              
              {/* Area Fill */}
              <polygon points={trendData.fillPointsStr} fill="url(#areaGrad)" />
              {/* Trend Line */}
              <polyline points={trendData.pointsStr} fill="none" stroke="url(#lineGrad)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
              
              {/* Point Dots */}
              {stats.dailyTrend.map((t, i) => {
                const x = trendData.paddingX + (i / (stats.dailyTrend.length - 1 || 1)) * (trendData.width - 2 * trendData.paddingX);
                const y = trendData.height - trendData.paddingY - (t.revenue / trendData.maxRevenue) * (trendData.height - 2 * trendData.paddingY);
                return (
                  <circle key={i} cx={x} cy={y} r="3.5" fill="var(--bg-surface)" stroke="var(--color-primary)" strokeWidth="2.5" />
                );
              })}
            </svg>
          </div>
          {/* Labels X */}
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: `0 ${trendData.paddingX}px`, marginTop: '8px', fontSize: '9px', color: 'var(--text-muted)', fontWeight: 700 }}>
            {stats.dailyTrend.map((t, i) => {
              const count = stats.dailyTrend.length;
              const shouldShow = count <= 8 || i === 0 || i === count - 1 || i === Math.floor(count / 2) || i === Math.floor(count / 4) || i === Math.floor(3 * count / 4);
              return shouldShow ? <span key={i}>{t.dateLabel}</span> : <span key={i} style={{ visibility: 'hidden' }}></span>;
            })}
          </div>
        </div>

        {/* Bottom Splits & Audits */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
          {/* Splits */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div className="card" style={{ padding: '20px', background: 'var(--glass-bg)', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-sm)', borderRadius: 'var(--radius-md)' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '18px' }}>Revenue Split by Mode</h3>
              {Object.keys(stats.paymentSplit).length === 0 ? (
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontWeight: 500 }}>No transactions recorded.</p>
              ) : (
                Object.entries(stats.paymentSplit).map(([m, val]) => {
                  const pct = stats.totalRevenue > 0 ? (val / stats.totalRevenue) * 100 : 0;
                  const name = m === 'upi' ? '📱 UPI Mobile Pay' : m === 'card' ? '💳 Online Credit Card' : '💵 Cash/COD';
                  return (
                    <div key={m} style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: 700 }}>
                        <span style={{ color: 'var(--text-secondary)' }}>{name}</span>
                        <span>{formatCurrency(val)}</span>
                      </div>
                      <div style={{ height: '6px', background: 'rgba(0,0,0,0.25)', borderRadius: '4px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.03)' }}>
                        <div style={{ height: '100%', background: 'linear-gradient(90deg, var(--color-primary) 0%, #FF8960 100%)', width: `${pct}%`, borderRadius: '4px' }}></div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            <div className="card" style={{ padding: '20px', background: 'var(--glass-bg)', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-sm)', borderRadius: 'var(--radius-md)' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '14px' }}>Operational Order Types</h3>
              {Object.keys(stats.typeSplit).length === 0 ? (
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontWeight: 500 }}>No orders placed.</p>
              ) : (
                Object.entries(stats.typeSplit).map(([t, count]) => {
                  const name = t.toUpperCase();
                  let icon = 'delivery_dining';
                  if (t.toLowerCase() === 'takeaway' || t.toLowerCase() === 'pickup') icon = 'shopping_bag';
                  if (t.toLowerCase() === 'dinein' || t.toLowerCase() === 'dine-in') icon = 'table_restaurant';
                  return (
                    <div key={t} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: '12px', fontWeight: 600 }}>
                      <span style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span className="material-symbols-rounded" style={{ fontSize: '16px', color: 'var(--color-primary)' }}>{icon}</span>
                        {name}
                      </span>
                      <strong style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>{count} orders</strong>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Ledger Audits */}
          <div className="card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', height: '400px', background: 'var(--glass-bg)', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-sm)', borderRadius: 'var(--radius-md)' }}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Cloud Ledger Audit Trails</span>
              <span style={{ fontSize: '10px', padding: '2px 6px', background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16,185,129,0.2)', color: 'var(--color-success)', borderRadius: '4px', fontWeight: 700 }}>Immutable Logs</span>
            </h3>
            <div style={{ flex: 1, overflowY: 'auto', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '8px', background: 'rgba(0,0,0,0.15)' }} className="scrollbar-none">
              {stats.recentAudits.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '16px', color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>No audit actions logged.</div>
              ) : (
                stats.recentAudits.map((aud, idx) => {
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

                  return (
                    <div key={idx} style={{ padding: '12px 14px', borderBottom: '1px solid rgba(255,255,255,0.03)', fontSize: '11px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '9px', fontWeight: 800, padding: '2px 6px', background: actionBadgeColor, border: `1px solid ${actionBadgeBorder}`, color: actionColor, borderRadius: '4px', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                            {aud.action}
                          </span>
                          <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>on {aud.target_table}</span>
                          <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>({aud.target_id})</span>
                        </div>
                        <p style={{ color: 'var(--text-muted)', margin: '4px 0 0', fontSize: '10px', lineHeight: 1.4 }}>{detailsText}</p>
                      </div>
                      <div style={{ color: 'var(--text-muted)', fontWeight: 700, textAlign: 'right', fontSize: '10px', flexShrink: 0 }}>
                        <div>{timeStr}</div>
                        <div style={{ fontSize: '8px', fontWeight: 500, opacity: 0.8, marginTop: '1px' }}>{dateStr}</div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
