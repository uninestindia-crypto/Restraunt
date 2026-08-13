import React, { useState, useEffect, useMemo } from 'react';
import { db, getTodayStats } from '../../db/database';
import { ensureFresh } from '../../services/cloudDb';
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
  const [topItems, setTopItems] = useState<{ name: string; qty: number; isVeg?: number }[]>([]);
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
      // Every figure below is a store-wide total, so the rows behind them are
      // pulled from the cloud before anything is counted.
      await ensureFresh(['orders', 'items', 'staff']);

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

      // Fetch top selling items and look up veg/non-veg status
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
            const name = item.name || item.itemName || 'Unknown';
            // The field is `quantity`; `qty` is only ever a legacy alias on older rows.
            // Reading `qty` alone made every line count as one, so an order of ten
            // samosas moved this chart by one — the top-items list was a list of the
            // most frequently *ordered* dishes, not the most *sold*.
            itemCounts[name] = (itemCounts[name] || 0) + (Number(item.quantity ?? item.qty) || 1);
          }
        }
      }
      
      const sortedItems = Object.entries(itemCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

      const itemsWithVeg = [];
      for (const [name, qty] of sortedItems) {
        const menuItem = await db.menuItems.where('name').equals(name).first();
        itemsWithVeg.push({
          name,
          qty,
          isVeg: menuItem ? menuItem.isVeg : 1
        });
      }
      setTopItems(itemsWithVeg);

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
  }, [storeState.activeTerminalStaff]);

  const maxRevenue = useMemo(() => {
    const maxVal = Math.max(...weeklyTrend.map((d) => d.revenue), 0);
    return maxVal > 0 ? maxVal : 1;
  }, [weeklyTrend]);

  // Construct chart elements
  const chartPoints = useMemo(() => {
    const width = 800;
    const height = 180;
    const paddingX = 40;
    const paddingY = 20;

    let pointsStr = '';
    let fillPointsStr = `${paddingX},${height - paddingY} `;

    weeklyTrend.forEach((t, i) => {
      const x = paddingX + (i / (weeklyTrend.length - 1 || 1)) * (width - 2 * paddingX);
      const y = height - paddingY - (t.revenue / maxRevenue) * (height - 2 * paddingY);
      pointsStr += `${x},${y} `;
      fillPointsStr += `${x},${y} `;
    });
    if (weeklyTrend.length > 0) {
      fillPointsStr += `${width - paddingX},${height - paddingY}`;
    }

    return { pointsStr, fillPointsStr, width, height, paddingX, paddingY };
  }, [weeklyTrend, maxRevenue]);

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
      <style>{`
        @keyframes heartbeat {
          0% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.2); opacity: 0.7; }
          100% { transform: scale(1); opacity: 1; }
        }
        .heartbeat-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background-color: var(--color-success-on-surface);
          animation: heartbeat 2s infinite ease-in-out;
          display: inline-block;
          box-shadow: 0 0 8px var(--color-success);
        }
        .stats-card-v2 {
          background: var(--glass-bg);
          border: 1px solid var(--border-color);
          border-left: 4px solid transparent;
          border-radius: var(--radius-md);
          padding: 22px 24px;
          box-shadow: var(--shadow-sm);
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          display: flex;
          flex-direction: column;
          position: relative;
          overflow: hidden;
          backdrop-filter: blur(20px);
        }
        .stats-card-v2:hover {
          transform: translateY(-4px) scale(1.01);
          box-shadow: var(--shadow-md);
          border-color: var(--border-active);
        }
        .stats-card-v2.revenue {
          border-left-color: var(--color-success-on-surface);
          background: linear-gradient(135deg, rgba(var(--color-success-rgb), 0.04) 0%, transparent 100%),
                      repeating-linear-gradient(45deg, rgba(var(--color-success-rgb), 0.01) 0px, rgba(var(--color-success-rgb), 0.01) 1px, transparent 1px, transparent 8px),
                      var(--bg-surface);
          box-shadow: 0 4px 20px rgba(var(--color-success-rgb), 0.03);
        }
        .stats-card-v2.orders {
          border-left-color: var(--color-primary);
          background: linear-gradient(135deg, rgba(var(--color-primary-rgb), 0.04) 0%, transparent 100%),
                      repeating-linear-gradient(45deg, rgba(var(--color-primary-rgb), 0.01) 0px, rgba(var(--color-primary-rgb), 0.01) 1px, transparent 1px, transparent 8px),
                      var(--bg-surface);
          box-shadow: 0 4px 20px rgba(var(--color-primary-rgb), 0.03);
        }
        .stats-card-v2.avgval {
          border-left-color: var(--color-info);
          background: linear-gradient(135deg, rgba(var(--color-info-rgb), 0.04) 0%, transparent 100%),
                      repeating-linear-gradient(45deg, rgba(var(--color-info-rgb), 0.01) 0px, rgba(var(--color-info-rgb), 0.01) 1px, transparent 1px, transparent 8px),
                      var(--bg-surface);
          box-shadow: 0 4px 20px rgba(var(--color-info-rgb), 0.03);
        }
      `}</style>

      <div style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-lg)', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span className="material-symbols-rounded" style={{ color: 'var(--color-primary)' }}>analytics</span>
        Administrative Control Tower
      </div>

      {/* Stats Grid */}
      <div className="stats-grid" style={{ padding: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px' }}>
        <div className="stats-card-v2 revenue">
          <div style={{ display: 'flex', justifySelf: 'stretch', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="stats-card-label" style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.05em' }}>TODAY'S REVENUE</span>
            <div style={{ width: '38px', height: '38px', borderRadius: '50%', background: 'rgba(var(--color-success-rgb), 0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span className="material-symbols-rounded" style={{ color: 'var(--color-success-on-surface)', fontSize: '18px' }}>payments</span>
            </div>
          </div>
          <div className="stats-card-value" style={{ color: 'var(--color-success-on-surface)', filter: 'drop-shadow(0 0 10px rgba(var(--color-success-rgb), 0.2))', fontSize: '1.8rem', fontWeight: 800, marginTop: '8px' }}>
            {formatCurrency(stats.totalRevenue)}
          </div>
        </div>
        
        <div className="stats-card-v2 orders">
          <div style={{ display: 'flex', justifySelf: 'stretch', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="stats-card-label" style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.05em' }}>COMPLETED ORDERS</span>
            <div style={{ width: '38px', height: '38px', borderRadius: '50%', background: 'rgba(var(--color-primary-rgb), 0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span className="material-symbols-rounded" style={{ color: 'var(--color-primary)', fontSize: '18px' }}>receipt_long</span>
            </div>
          </div>
          <div className="stats-card-value" style={{ color: 'var(--color-primary)', filter: 'drop-shadow(0 0 10px rgba(var(--color-primary-rgb), 0.2))', fontSize: '1.8rem', fontWeight: 800, marginTop: '8px' }}>
            {stats.totalOrders}
          </div>
        </div>

        <div className="stats-card-v2 avgval">
          <div style={{ display: 'flex', justifySelf: 'stretch', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="stats-card-label" style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.05em' }}>AVERAGE BILL VALUE</span>
            <div style={{ width: '38px', height: '38px', borderRadius: '50%', background: 'rgba(var(--color-info-rgb), 0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span className="material-symbols-rounded" style={{ color: 'var(--color-info)', fontSize: '18px' }}>monitoring</span>
            </div>
          </div>
          <div className="stats-card-value" style={{ color: 'var(--color-info)', filter: 'drop-shadow(0 0 10px rgba(var(--color-info-rgb), 0.2))', fontSize: '1.8rem', fontWeight: 800, marginTop: '8px' }}>
            {formatCurrency(stats.avgOrderValue)}
          </div>
        </div>
      </div>

      {/* 7-Day Revenue Trend */}
      <div className="card" style={{
        position: 'relative',
        background: 'linear-gradient(180deg, rgba(var(--color-primary-rgb), 0.01) 0%, transparent 100%), var(--glass-bg)',
        border: '1px solid var(--border-color)',
        borderRadius: 'var(--radius-md)',
        padding: '24px',
        boxShadow: 'var(--shadow-sm)'
      }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '20px', letterSpacing: '-0.01em', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="material-symbols-rounded" style={{ fontSize: '20px', color: 'var(--color-info)' }}>trending_up</span>
          7-Day Revenue Trend
        </div>

        {/* Custom SVG Bezier chart */}
        <div style={{ width: '100%', overflow: 'hidden', position: 'relative' }}>
          <svg viewBox={`0 0 ${chartPoints.width} ${chartPoints.height}`} style={{ width: '100%', height: '180px', display: 'block', overflow: 'visible' }}>
            <defs>
              <linearGradient id="areaGradDashboard" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.3"/>
                <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0"/>
              </linearGradient>
              <linearGradient id="lineGradDashboard" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#FF5E36"/>
                <stop offset="100%" stopColor="#FF8960"/>
              </linearGradient>
              <filter id="glowDashboard" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>
            {/* Grid Lines */}
            <line x1={chartPoints.paddingX} y1={chartPoints.paddingY} x2={chartPoints.width - chartPoints.paddingX} y2={chartPoints.paddingY} stroke="var(--border-color)" strokeWidth="1" />
            <line x1={chartPoints.paddingX} y1={(chartPoints.height - 2*chartPoints.paddingY)/2 + chartPoints.paddingY} x2={chartPoints.width - chartPoints.paddingX} y2={(chartPoints.height - 2*chartPoints.paddingY)/2 + chartPoints.paddingY} stroke="var(--border-color)" strokeWidth="1" />
            <line x1={chartPoints.paddingX} y1={chartPoints.height - chartPoints.paddingY} x2={chartPoints.width - chartPoints.paddingX} y2={chartPoints.height - chartPoints.paddingY} stroke="var(--border-active)" strokeWidth="1.5" />
            
            {/* Area Fill */}
            <polygon points={chartPoints.fillPointsStr} fill="url(#areaGradDashboard)" />
            {/* Trend Line */}
            <polyline points={chartPoints.pointsStr} fill="none" stroke="url(#lineGradDashboard)" strokeWidth="3" filter="url(#glowDashboard)" strokeLinecap="round" strokeLinejoin="round" />
            
            {/* Point Interaction Nodes */}
            {weeklyTrend.map((d, i) => {
              const x = chartPoints.paddingX + (i / (weeklyTrend.length - 1 || 1)) * (chartPoints.width - 2 * chartPoints.paddingX);
              const y = chartPoints.height - chartPoints.paddingY - (d.revenue / maxRevenue) * (chartPoints.height - 2 * chartPoints.paddingY);
              const isToday = i === 6;
              const isHovered = hoveredBarIndex === i;

              return (
                <g key={i}>
                  <circle
                    cx={x}
                    cy={y}
                    r={isHovered ? 6 : (isToday ? 4.5 : 3.5)}
                    fill="var(--bg-surface)"
                    stroke={isToday || isHovered ? "var(--color-primary)" : "var(--border-active)"}
                    strokeWidth={isHovered ? 3.5 : 2}
                    style={{ transition: 'all 0.15s ease', cursor: 'pointer' }}
                    onMouseEnter={() => setHoveredBarIndex(i)}
                    onMouseLeave={() => setHoveredBarIndex(null)}
                  />
                </g>
              );
            })}
          </svg>

          {/* Dynamic Floating Tooltip */}
          {hoveredBarIndex !== null && (
            <div style={{
              position: 'absolute',
              left: `${(hoveredBarIndex / (weeklyTrend.length - 1)) * 90 + 5}%`,
              bottom: `${Math.max((weeklyTrend[hoveredBarIndex].revenue / maxRevenue) * 60 + 30, 40)}px`,
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-active)',
              borderRadius: '8px',
              padding: '6px 12px',
              fontSize: 'var(--text-xs)',
              fontWeight: 700,
              color: 'var(--text-primary)',
              boxShadow: 'var(--shadow-md)',
              pointerEvents: 'none',
              transform: 'translateX(-50%)',
              transition: 'all 0.15s ease',
              zIndex: 10
            }}>
              <div style={{ color: 'var(--text-muted)', fontSize: '9px', marginBottom: '2px' }}>{weeklyTrend[hoveredBarIndex].label}</div>
              {formatCurrency(weeklyTrend[hoveredBarIndex].revenue)}
            </div>
          )}
        </div>

        {/* Chart Labels */}
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: `0 ${chartPoints.paddingX}px`, marginTop: '12px' }}>
          {weeklyTrend.map((d, i) => (
            <div key={i} style={{
              fontSize: '10px',
              color: i === 6 ? 'var(--color-primary)' : 'var(--text-secondary)',
              fontWeight: i === 6 ? 800 : 600
            }}>
              {d.label}
            </div>
          ))}
        </div>
      </div>

      {/* Grid: Top Items & System Health */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
        
        {/* Top Selling Items */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px', background: 'linear-gradient(135deg, rgba(var(--color-warning-rgb), 0.02) 0%, var(--glass-bg) 100%)', border: '1px solid var(--border-color)', borderLeft: '4px solid var(--color-warning)', borderRadius: 'var(--radius-md)', padding: '24px', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="material-symbols-rounded" style={{ fontSize: '20px', color: 'var(--color-warning)' }}>local_fire_department</span>
            Top Selling Items (Today)
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {topItems.length === 0 ? (
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontWeight: 500 }}>No orders recorded yet today.</div>
            ) : (
              topItems.map((item, i) => {
                const maxQty = topItems[0].qty || 1;
                const widthPercent = (item.qty / maxQty) * 100;
                const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`;
                const dietarySymbol = item.isVeg === 1 ? '🟢' : '🔺';
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '0.9rem', width: '28px', textAlign: 'center', flexShrink: 0, fontWeight: 700 }}>{medal}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-primary)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          <span style={{ fontSize: '10px' }}>{dietarySymbol}</span>
                          {item.name}
                        </span>
                        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-primary)', fontWeight: 800, flexShrink: 0, marginLeft: '8px' }}>×{item.qty}</span>
                      </div>
                      <div style={{ height: '5px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-full)', overflow: 'hidden', border: '1px solid var(--border-glass)' }}>
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
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px', background: 'linear-gradient(135deg, rgba(var(--color-success-rgb), 0.02) 0%, var(--glass-bg) 100%)', border: '1px solid var(--border-color)', borderLeft: '4px solid var(--color-success)', borderRadius: 'var(--radius-md)', padding: '24px', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="material-symbols-rounded" style={{ fontSize: '20px', color: 'var(--color-success-on-surface)' }}>monitor_heart</span>
            System Diagnostics
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {[
              { icon: 'cloud', label: 'Network Telemetry', value: storeState.isOnline ? 'Online' : 'Offline', color: storeState.isOnline ? 'var(--color-success)' : 'var(--color-danger)', heartbeat: storeState.isOnline },
              { icon: 'person', label: 'Console Operator', value: activeStaff ? `${activeStaff.name} (${activeStaff.role})` : 'None', color: 'var(--color-success-on-surface)' },
              { icon: 'groups', label: 'Active Staff Members', value: `${systemHealth.staffCount} staff`, color: 'var(--color-info)' },
              { icon: 'restaurant_menu', label: 'Menu Catalog Items', value: `${systemHealth.totalMenuItems} items`, color: 'var(--color-warning)' },
              { icon: 'receipt_long', label: 'Total Orders Logged', value: `${systemHealth.totalOrders}`, color: 'var(--color-primary)' },
              { icon: 'palette', label: 'Terminal UI Theme', value: themeLabel, color: 'var(--nextgenos-purple)' },
            ].map((item, idx) => (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span className="material-symbols-rounded" style={{ fontSize: '20px', color: item.color, flexShrink: 0 }}>{item.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '10px', color: 'var(--text-secondary)', fontWeight: 600 }}>{item.label}</div>
                </div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-primary)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {item.heartbeat && <span className="heartbeat-dot"></span>}
                  <span>{item.value}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Payment Split Breakdown */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px', background: 'linear-gradient(135deg, rgba(var(--color-primary-rgb), 0.02) 0%, var(--glass-bg) 100%)', border: '1px solid var(--border-color)', borderLeft: '4px solid var(--color-primary)', borderRadius: 'var(--radius-md)', padding: '24px', boxShadow: 'var(--shadow-sm)' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
          Revenue Split by Method
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {Object.keys(stats.paymentBreakdown).length === 0 ? (
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontWeight: 500 }}>No sales recorded yet today.</div>
          ) : (
            Object.entries(stats.paymentBreakdown).map(([method, data]) => {
              const label = method === 'upi' ? '📱 UPI (Digital Payment)' : method === 'cash' ? '💵 Cash Payment' : method.toUpperCase();
              const pct = stats.totalRevenue > 0 ? (data.total / stats.totalRevenue) * 100 : 0;
              return (
                <div key={method} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', justifySelf: 'stretch', justifyContent: 'space-between', fontSize: 'var(--text-xs)', fontWeight: 700 }}>
                    <span style={{ color: 'var(--text-secondary)' }}>
                      {label} <span style={{ color: 'var(--text-muted)', fontSize: '10px', marginLeft: '4px', fontWeight: 500 }}>({data.count} orders)</span>
                    </span>
                    <span style={{ fontWeight: 800, color: 'var(--text-primary)' }}>{formatCurrency(data.total)}</span>
                  </div>
                  <div style={{ height: '6px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-full)', overflow: 'hidden', border: '1px solid var(--border-glass)' }}>
                    <div style={{ height: '100%', background: 'var(--gradient-primary)', width: `${pct}%`, borderRadius: 'var(--radius-full)', boxShadow: '0 0 10px rgba(var(--color-primary-rgb), 0.3)', transition: 'width 0.8s ease' }} />
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
