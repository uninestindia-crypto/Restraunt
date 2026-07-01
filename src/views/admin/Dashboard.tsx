// @ts-nocheck
import React, { useState, useEffect, useMemo } from 'react';
import { db, getTodayStats } from '../../db/database';
import { formatCurrency } from '../../utils/helpers';
import { globalStore } from '../../store/Store';

export function useGlobalStore() {
  const [state, setState] = useState(globalStore.getState());
  useEffect(() => {
    return globalStore.subscribe((newState) => {
      setState(newState);
    });
  }, []);
  return state;
}

interface TodayStats {
  totalRevenue: number;
  totalOrders: number;
  avgOrderValue: number;
  paymentBreakdown: Record<string, { count: number; total: number }>;
}

interface TrendDay {
  label: string;
  revenue: number;
  date: Date;
}

export function Dashboard() {
  const storeState = useGlobalStore();
  const [stats, setStats] = useState<TodayStats | null>(null);
  const [weeklyTrend, setWeeklyTrend] = useState<TrendDay[]>([]);
  const [topItems, setTopItems] = useState<{ name: string; qty: number }[]>([]);
  const [systemHealth, setSystemHealth] = useState<{
    staffCount: number;
    totalMenuItems: number;
    totalOrders: number;
  }>({ staffCount: 0, totalMenuItems: 0, totalOrders: 0 });
  const [hoveredBarIndex, setHoveredBarIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    try {
      setLoading(true);
      // Fetch today's summary stats
      const todayStats = await getTodayStats();
      setStats(todayStats);

      // Fetch 7-day revenue trend
      const days: TrendDay[] = [];
      const now = new Date();
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
        const dayEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).toISOString();

        let revenue = 0;
        try {
          const orders = await db.orders.where('createdAt').between(dayStart, dayEnd).toArray();
          revenue = orders
            .filter((o: any) => o.paymentStatus === 'paid')
            .reduce((s: number, o: any) => s + (o.total || 0), 0);
        } catch (err) {
          console.error('[Dashboard] Error querying trend orders:', err);
        }
        days.push({
          label: d.toLocaleDateString('en-IN', { weekday: 'short' }),
          revenue,
          date: d,
        });
      }
      setWeeklyTrend(days);

      // Fetch top selling items
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();
      const todayOrders = await db.orders.where('createdAt').between(todayStart, todayEnd).toArray();

      const itemCounts: Record<string, number> = {};
      for (const order of todayOrders) {
        let items = order.items;
        if (typeof items === 'string') {
          try {
            items = JSON.parse(items);
          } catch {
            items = [];
          }
        }
        if (Array.isArray(items)) {
          for (const item of items) {
            const name = item.name || 'Unknown';
            itemCounts[name] = (itemCounts[name] || 0) + (item.qty || 1);
          }
        }
      }
      const sortedItems = Object.entries(itemCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, qty]) => ({ name, qty }));
      setTopItems(sortedItems);

      // Fetch general system database health counts
      const staffCount = await db.staff.filter((s: any) => s.isActive === true || s.isActive === 1).count();
      const totalMenuItems = await db.menuItems.count();
      const totalOrders = await db.orders.count();
      setSystemHealth({ staffCount, totalMenuItems, totalOrders });

    } catch (err) {
      console.error('[Dashboard] Failed loading dashboard stats:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // Refresh health data if operator state changes
  }, [storeState.activeTerminalStaff]);

  const maxRevenue = useMemo(() => {
    const maxVal = Math.max(...weeklyTrend.map((d) => d.revenue), 0);
    return maxVal > 0 ? maxVal : 1;
  }, [weeklyTrend]);

  if (loading || !stats) {
    return (
      <div style={{ padding: '28px 24px', display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '1100px', margin: '0 auto', width: '100%' }}>
        <div className="skeleton-card" style={{ height: '40px', width: '200px', borderRadius: '8px' }}></div>
        <div className="stats-grid" style={{ padding: 0 }}>
          <div className="stats-card skeleton-card" style={{ height: '108px', borderRadius: '12px' }}></div>
          <div className="stats-card skeleton-card" style={{ height: '108px', borderRadius: '12px' }}></div>
          <div className="stats-card skeleton-card" style={{ height: '108px', borderRadius: '12px' }}></div>
        </div>
        <div className="card skeleton-card" style={{ height: '200px', borderRadius: '12px' }}></div>
      </div>
    );
  }

  const activeStaff = storeState.activeTerminalStaff;
  const currentTheme = localStorage.getItem('app_theme') || 'system';
  const themeLabel = { dark: '🌙 Dark', light: '☀️ Light', system: '💻 System' }[currentTheme] || 'System';

  return (
    <div style={{ padding: '28px 24px', display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '1100px', margin: '0 auto', width: '100%' }}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-lg)', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
        Console Overview
      </div>

      {/* Stats Grid */}
      <div className="stats-grid" style={{ padding: 0 }}>
        <div className="stats-card" style={{ transition: 'transform var(--transition-fast)' }}>
          <div className="stats-card-label">TODAY'S REVENUE</div>
          <div className="stats-card-value" style={{ color: 'var(--color-success)', filter: 'drop-shadow(0 0 10px rgba(16, 185, 129, 0.25))' }}>
            {formatCurrency(stats.totalRevenue)}
          </div>
        </div>
        <div className="stats-card">
          <div className="stats-card-label">COMPLETED ORDERS</div>
          <div className="stats-card-value" style={{ color: 'var(--color-primary)', filter: 'drop-shadow(0 0 10px rgba(255, 94, 54, 0.25))' }}>
            {stats.totalOrders}
          </div>
        </div>
        <div className="stats-card">
          <div className="stats-card-label">AVERAGE BILL VALUE</div>
          <div className="stats-card-value" style={{ color: 'var(--color-info)', filter: 'drop-shadow(0 0 10px rgba(59, 130, 246, 0.25))' }}>
            {formatCurrency(stats.avgOrderValue)}
          </div>
        </div>
      </div>

      {/* 7-Day Revenue Trend */}
      <div className="card" style={{ position: 'relative' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '20px', letterSpacing: '-0.01em', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span className="material-symbols-rounded" style={{ fontSize: '18px', color: 'var(--color-info)' }}>trending_up</span>
          7-Day Revenue Trend
        </div>

        {/* Chart Bars */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '12px', height: '140px', padding: '10px 4px 0 4px', borderBottom: '1px solid var(--border-glass)' }}>
          {weeklyTrend.map((d, i) => {
            const heightPercent = Math.max((d.revenue / maxRevenue) * 100, 5);
            const isToday = i === 6;
            const isHovered = hoveredBarIndex === i;

            return (
              <div
                key={i}
                style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', cursor: 'pointer', position: 'relative' }}
                onMouseEnter={() => setHoveredBarIndex(i)}
                onMouseLeave={() => setHoveredBarIndex(null)}
              >
                {/* Floating Tooltip */}
                {isHovered && (
                  <div style={{
                    position: 'absolute',
                    bottom: `${heightPercent + 15}%`,
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-active)',
                    borderRadius: '6px',
                    padding: '4px 8px',
                    fontSize: '10px',
                    fontWeight: 700,
                    color: 'var(--text-primary)',
                    boxShadow: 'var(--shadow-md)',
                    pointerEvents: 'none',
                    whiteSpace: 'nowrap',
                    zIndex: 10
                  }}>
                    {formatCurrency(d.revenue)}
                  </div>
                )}
                {/* Bar */}
                <div style={{
                  width: '100%',
                  height: `${heightPercent}px`,
                  background: isToday 
                    ? 'linear-gradient(180deg, #FF5E36 0%, #FF8960 100%)' 
                    : (isHovered ? 'rgba(255, 255, 255, 0.12)' : 'rgba(255, 255, 255, 0.06)'),
                  borderRadius: '6px 6px 0 0',
                  border: `1px solid ${isToday ? 'rgba(255, 94, 54, 0.4)' : 'var(--border-glass)'}`,
                  boxShadow: isToday ? '0 0 12px rgba(255, 94, 54, 0.3)' : 'none',
                  transition: 'all var(--transition-fast)'
                }} />
              </div>
            );
          })}
        </div>

        {/* Chart Labels */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10px' }}>
          {weeklyTrend.map((d, i) => (
            <div key={i} style={{
              flex: 1,
              textAlign: 'center',
              fontSize: '10px',
              color: i === 6 ? 'var(--color-primary)' : 'var(--text-secondary)',
              fontWeight: i === 6 ? 700 : 500
            }}>
              {d.label}
            </div>
          ))}
        </div>
      </div>

      {/* Grid: Top Items & System Health */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
        {/* Top Selling Items */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span className="material-symbols-rounded" style={{ fontSize: '18px', color: 'var(--color-warning)' }}>local_fire_department</span>
            Top Selling Items (Today)
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {topItems.length === 0 ? (
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontWeight: 500 }}>No orders recorded yet today.</div>
            ) : (
              topItems.map((item, i) => {
                const maxQty = topItems[0].qty || 1;
                const widthPercent = (item.qty / maxQty) * 100;
                const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`;
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '0.8rem', width: '24px', textAlign: 'center', flexShrink: 0 }}>{medal}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-primary)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
                        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontWeight: 700, flexShrink: 0, marginLeft: '8px' }}>×{item.qty}</span>
                      </div>
                      <div style={{ height: '4px', background: 'rgba(0, 0, 0, 0.2)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${widthPercent}%`, background: 'linear-gradient(90deg, var(--color-warning), #FBBF24)', borderRadius: 'var(--radius-full)', transition: 'width 0.6s ease' }} />
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* System Health */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span className="material-symbols-rounded" style={{ fontSize: '18px', color: 'var(--color-success)' }}>monitor_heart</span>
            System Health
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {[
              { icon: 'cloud', label: 'Network Status', value: storeState.isOnline ? 'Online' : 'Offline', color: storeState.isOnline ? 'var(--color-success)' : 'var(--color-danger)' },
              { icon: 'person', label: 'Terminal Operator', value: activeStaff ? `${activeStaff.name} (${activeStaff.role})` : 'None', color: 'var(--color-success)' },
              { icon: 'groups', label: 'Active Staff', value: `${systemHealth.staffCount} members`, color: 'var(--color-info)' },
              { icon: 'restaurant_menu', label: 'Menu Items', value: `${systemHealth.totalMenuItems} items`, color: 'var(--color-warning)' },
              { icon: 'receipt_long', label: 'Total Orders (All Time)', value: `${systemHealth.totalOrders}`, color: 'var(--color-primary)' },
              { icon: 'palette', label: 'Active Theme', value: themeLabel, color: 'var(--nextgenos-purple)' },
            ].map((item, idx) => (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span className="material-symbols-rounded" style={{ fontSize: '18px', color: item.color, flexShrink: 0 }}>{item.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 500 }}>{item.label}</div>
                </div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-primary)', fontWeight: 700 }}>{item.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Payment Split Breakdown */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
          Revenue Split by Method
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {Object.keys(stats.paymentBreakdown).length === 0 ? (
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontWeight: 500 }}>No sales recorded yet today.</div>
          ) : (
            Object.entries(stats.paymentBreakdown).map(([method, data]) => {
              const label = method === 'upi' ? '📱 UPI (Digital Pay)' : method === 'cash' ? '💵 Cash Pay' : method.toUpperCase();
              const pct = stats.totalRevenue > 0 ? (data.total / stats.totalRevenue) * 100 : 0;
              return (
                <div key={method} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', justifySelf: 'stretch', justifyContent: 'space-between', fontSize: 'var(--text-sm)', fontWeight: 600 }}>
                    <span style={{ color: 'var(--text-secondary)' }}>
                      {label} <span style={{ color: 'var(--text-muted)', fontSize: '11px', marginLeft: '4px' }}>({data.count} orders)</span>
                    </span>
                    <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{formatCurrency(data.total)}</span>
                  </div>
                  <div style={{ height: '6px', background: 'rgba(0, 0, 0, 0.25)', borderRadius: 'var(--radius-full)', overflow: 'hidden', border: '1px solid var(--border-glass)' }}>
                    <div style={{ height: '100%', background: 'var(--gradient-primary)', width: `${pct}%`, borderRadius: 'var(--radius-full)', boxShadow: '0 0 10px rgba(255, 94, 54, 0.4)', transition: 'width 0.8s ease' }} />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
