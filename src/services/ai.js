/**
 * ═══════════════════════════════════════════════════
 *  NextGenOS Restaurant Operating System
 *  Module: AI Service
 *  Version: 2.0.0
 *  © 2026 NextGenOS. All Rights Reserved.
 *  This software is proprietary and confidential.
 * ═══════════════════════════════════════════════════
 */

import { db } from '../db/database.js';

const INTENTS = [
  { id: 'REVENUE_TODAY', keywords: ['revenue', 'sales', 'earned', 'money', 'income', 'earning'], handler: 'getRevenueToday' },
  { id: 'BEST_SELLERS', keywords: ['best', 'top', 'popular', 'selling', 'seller', 'famous', 'trending'], handler: 'getBestSellers' },
  { id: 'WORST_SELLERS', keywords: ['worst', 'least', 'slow', 'flop', 'not selling', 'poor'], handler: 'getWorstSellers' },
  { id: 'DAILY_SUMMARY', keywords: ['summary', 'overview', 'report', 'how was', 'day going', 'today'], handler: 'getDailySummary' },
  { id: 'PEAK_HOURS', keywords: ['peak', 'busy', 'rush', 'busiest', 'hour', 'when'], handler: 'getPeakHours' },
  { id: 'ORDER_COUNT', keywords: ['orders', 'count', 'how many orders', 'total orders', 'number of orders'], handler: 'getOrderCount' },
  { id: 'AVG_ORDER', keywords: ['average', 'avg', 'bill', 'ticket', 'order value', 'per order'], handler: 'getAvgOrderValue' },
  { id: 'FORECAST', keywords: ['predict', 'forecast', 'tomorrow', 'expect', 'projection', 'estimate'], handler: 'forecastRevenue' },
  { id: 'PROMO', keywords: ['promo', 'marketing', 'whatsapp', 'message', 'offer', 'write', 'promotion', 'advertise'], handler: 'generatePromo' },
  { id: 'CUSTOMER_COUNT', keywords: ['customer', 'customers', 'visitor', 'how many people', 'footfall'], handler: 'getCustomerCount' },
  { id: 'PAYMENT_SPLIT', keywords: ['payment', 'upi', 'cash', 'method', 'digital', 'split'], handler: 'getPaymentSplit' },
  { id: 'ANOMALY', keywords: ['unusual', 'anomaly', 'strange', 'weird', 'different', 'abnormal'], handler: 'detectAnomalies' },
];

class AIService {
  constructor() {
    this.conversationHistory = [];
  }

  formatCurrency(amount) {
    return `₹${Number(amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  }

  classifyIntent(query) {
    const lower = query.toLowerCase().trim();
    let bestMatch = null;
    let bestScore = 0;

    for (const intent of INTENTS) {
      let score = 0;
      for (const kw of intent.keywords) {
        if (lower.includes(kw)) score += 1;
      }
      if (score > bestScore) {
        bestScore = score;
        bestMatch = intent;
      }
    }

    return bestMatch || { id: 'DAILY_SUMMARY', handler: 'getDailySummary' };
  }

  async processQuery(query) {
    try {
      const intent = this.classifyIntent(query);
      const response = await this[intent.handler](query);
      return response;
    } catch (err) {
      console.error('AI query error:', err);
      return this.formatResponse('text',
        `I encountered an issue processing your request. Please try again.\n\n*Error: ${err.message}*`,
        null, ['📊 Today\'s Summary', '🏆 Best Sellers']
      );
    }
  }

  formatResponse(type, content, data = null, suggestions = []) {
    return { type, content, data, suggestions, timestamp: new Date().toISOString() };
  }

  getDateRange(daysBack = 0) {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysBack);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    return { start: start.toISOString(), end: end.toISOString() };
  }

  async getOrdersInRange(daysBack = 0) {
    const { start, end } = this.getDateRange(daysBack);
    const orders = await db.orders.where('createdAt').between(start, end).toArray();
    return orders.filter(o => o.paymentStatus === 'paid' || o.status === 'completed');
  }

  parseItems(order) {
    return typeof order.items === 'string' ? JSON.parse(order.items) : (order.items || []);
  }

  // ─── Intent Handlers ────────────────────────────

  async getRevenueToday() {
    const orders = await this.getOrdersInRange(0);
    const revenue = orders.reduce((s, o) => s + (o.total || 0), 0);
    const count = orders.length;

    return this.formatResponse('text',
      `📊 **Today's Revenue**: ${this.formatCurrency(revenue)}\n\n` +
      `From **${count}** completed orders.\n` +
      (count > 0 ? `Average bill: ${this.formatCurrency(revenue / count)}` : 'No orders yet today.'),
      { revenue, count },
      ['🏆 Best Sellers', '⏰ Peak Hours', '📈 Forecast Tomorrow']
    );
  }

  async getBestSellers() {
    const orders = await this.getOrdersInRange(6);
    const itemMap = {};
    orders.forEach(o => {
      this.parseItems(o).forEach(item => {
        const name = item.itemName || item.name;
        if (!itemMap[name]) itemMap[name] = { qty: 0, revenue: 0 };
        itemMap[name].qty += item.quantity || 1;
        itemMap[name].revenue += (item.price || 0) * (item.quantity || 1);
      });
    });

    const sorted = Object.entries(itemMap).sort((a, b) => b[1].qty - a[1].qty).slice(0, 10);
    const medals = ['🥇', '🥈', '🥉'];

    let text = `🏆 **Top Sellers** (Last 7 Days)\n\n`;
    sorted.forEach(([name, data], i) => {
      const medal = medals[i] || `${i + 1}.`;
      text += `${medal} **${name}** — ${data.qty} sold (${this.formatCurrency(data.revenue)})\n`;
    });

    if (sorted.length === 0) text = '📭 No order data available for the last 7 days.';

    return this.formatResponse('text', text, { items: sorted },
      ['📊 Today\'s Summary', '📉 Worst Sellers', '💰 Revenue Today']
    );
  }

  async getWorstSellers() {
    const orders = await this.getOrdersInRange(6);
    const itemMap = {};
    orders.forEach(o => {
      this.parseItems(o).forEach(item => {
        const name = item.itemName || item.name;
        if (!itemMap[name]) itemMap[name] = { qty: 0 };
        itemMap[name].qty += item.quantity || 1;
      });
    });

    const sorted = Object.entries(itemMap).sort((a, b) => a[1].qty - b[1].qty).slice(0, 5);
    let text = `📉 **Slowest Sellers** (Last 7 Days)\n\n`;
    sorted.forEach(([name, data], i) => {
      text += `${i + 1}. **${name}** — Only ${data.qty} sold\n`;
    });

    if (sorted.length === 0) text = '📭 No data available.';

    text += `\n💡 *Consider running promotions on these items or reviewing if they should stay on the menu.*`;

    return this.formatResponse('text', text, null,
      ['🏆 Best Sellers', '📊 Today\'s Summary']
    );
  }

  async getDailySummary() {
    const todayOrders = await this.getOrdersInRange(0);
    const revenue = todayOrders.reduce((s, o) => s + (o.total || 0), 0);
    const count = todayOrders.length;
    const avg = count > 0 ? revenue / count : 0;

    // Yesterday comparison
    const { start: yStart, end: yEnd } = this.getDateRange(1);
    const { start: tStart } = this.getDateRange(0);
    const yesterdayOrders = (await db.orders.where('createdAt').between(yStart, tStart).toArray())
      .filter(o => o.paymentStatus === 'paid' || o.status === 'completed');
    const yRevenue = yesterdayOrders.reduce((s, o) => s + (o.total || 0), 0);
    const growth = yRevenue > 0 ? ((revenue - yRevenue) / yRevenue * 100).toFixed(1) : 0;
    const growthIcon = growth > 0 ? '📈' : growth < 0 ? '📉' : '➡️';

    // Top item today
    const itemMap = {};
    todayOrders.forEach(o => {
      this.parseItems(o).forEach(item => {
        const name = item.itemName || item.name;
        if (!itemMap[name]) itemMap[name] = 0;
        itemMap[name] += item.quantity || 1;
      });
    });
    const topItem = Object.entries(itemMap).sort((a, b) => b[1] - a[1])[0];

    let text = `📋 **Today's Summary**\n\n`;
    text += `💰 Revenue: **${this.formatCurrency(revenue)}**\n`;
    text += `📦 Orders: **${count}**\n`;
    text += `🧾 Avg Bill: **${this.formatCurrency(avg)}**\n`;
    text += `${growthIcon} vs Yesterday: **${growth > 0 ? '+' : ''}${growth}%**\n`;
    if (topItem) text += `🏆 Top Item: **${topItem[0]}** (${topItem[1]} sold)\n`;

    if (count === 0) text = `📋 **Today's Summary**\n\nNo orders yet today. The day is young! 🌅`;

    return this.formatResponse('text', text, { revenue, count, avg, growth },
      ['🏆 Best Sellers', '⏰ Peak Hours', '📈 Forecast Tomorrow']
    );
  }

  async getPeakHours() {
    const orders = await this.getOrdersInRange(6);
    const hourMap = {};
    for (let h = 0; h < 24; h++) hourMap[h] = { orders: 0, revenue: 0 };

    orders.forEach(o => {
      const hour = new Date(o.createdAt).getHours();
      hourMap[hour].orders += 1;
      hourMap[hour].revenue += o.total || 0;
    });

    const sorted = Object.entries(hourMap)
      .filter(([, d]) => d.orders > 0)
      .sort((a, b) => b[1].orders - a[1].orders)
      .slice(0, 5);

    let text = `⏰ **Peak Hours** (Last 7 Days)\n\n`;
    sorted.forEach(([hour, data]) => {
      const h = parseInt(hour);
      const label = h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`;
      text += `🔥 **${label}** — ${data.orders} orders (${this.formatCurrency(data.revenue)})\n`;
    });

    if (sorted.length === 0) text += 'Not enough data yet.';
    text += `\n💡 *Schedule extra staff during peak hours for faster service.*`;

    return this.formatResponse('text', text, null,
      ['📊 Today\'s Summary', '🏆 Best Sellers']
    );
  }

  async getOrderCount() {
    const orders = await this.getOrdersInRange(0);
    const allOrders = await db.orders.toArray();
    return this.formatResponse('text',
      `📦 **Order Count**\n\nToday: **${orders.length}** orders\nAll Time: **${allOrders.length}** orders`,
      null, ['💰 Revenue Today', '📊 Summary']
    );
  }

  async getAvgOrderValue() {
    const orders = await this.getOrdersInRange(6);
    const revenue = orders.reduce((s, o) => s + (o.total || 0), 0);
    const avg = orders.length > 0 ? revenue / orders.length : 0;
    return this.formatResponse('text',
      `🧾 **Average Order Value** (Last 7 Days)\n\n` +
      `Average bill: **${this.formatCurrency(avg)}**\nFrom ${orders.length} orders totalling ${this.formatCurrency(revenue)}`,
      null, ['📊 Summary', '🏆 Best Sellers']
    );
  }

  async forecastRevenue() {
    const dayTotals = [];
    for (let d = 1; d <= 14; d++) {
      const orders = await this.getOrdersInRange(d);
      const prevOrders = d > 0 ? await this.getOrdersInRange(d - 1) : [];
      // Simplified: we'll use the last 7 same-day-of-week averages
    }

    // Simpler approach: average of last 7 days
    const weekOrders = await this.getOrdersInRange(6);
    const totalRev = weekOrders.reduce((s, o) => s + (o.total || 0), 0);
    const avgDaily = weekOrders.length > 0 ? totalRev / 7 : 0;
    const optimistic = avgDaily * 1.1;
    const pessimistic = avgDaily * 0.9;

    return this.formatResponse('text',
      `📈 **Revenue Forecast** (Tomorrow)\n\n` +
      `Based on your last 7 days performance:\n\n` +
      `🎯 Expected: **${this.formatCurrency(avgDaily)}**\n` +
      `📊 Optimistic: **${this.formatCurrency(optimistic)}**\n` +
      `📉 Conservative: **${this.formatCurrency(pessimistic)}**\n\n` +
      `*Based on daily average of ${this.formatCurrency(avgDaily)} over the last week.*`,
      null, ['📊 Today\'s Summary', '⏰ Peak Hours']
    );
  }

  async getPaymentSplit() {
    const orders = await this.getOrdersInRange(6);
    const split = {};
    orders.forEach(o => {
      const m = o.paymentMethod || 'unknown';
      if (!split[m]) split[m] = { count: 0, total: 0 };
      split[m].count += 1;
      split[m].total += o.total || 0;
    });

    let text = `💳 **Payment Breakdown** (Last 7 Days)\n\n`;
    Object.entries(split).forEach(([method, data]) => {
      const icon = method === 'upi' ? '📱' : method === 'cash' ? '💵' : '❓';
      text += `${icon} **${method.toUpperCase()}**: ${data.count} orders — ${this.formatCurrency(data.total)}\n`;
    });

    return this.formatResponse('text', text, null, ['📊 Summary', '💰 Revenue']);
  }

  async getCustomerCount() {
    const count = await db.customers.count();
    return this.formatResponse('text',
      `👥 **Customer Base**\n\nTotal registered customers: **${count}**\n\n` +
      (count === 0 ? '*Customers are auto-added when orders include phone numbers.*' : ''),
      null, ['📊 Summary']
    );
  }

  async generatePromo() {
    const orders = await this.getOrdersInRange(6);
    const itemMap = {};
    orders.forEach(o => {
      this.parseItems(o).forEach(item => {
        const name = item.itemName || item.name;
        if (!itemMap[name]) itemMap[name] = 0;
        itemMap[name] += item.quantity || 1;
      });
    });
    const topItem = Object.entries(itemMap).sort((a, b) => b[1] - a[1])[0];
    const itemName = topItem ? topItem[0] : 'our special menu';

    return this.formatResponse('text',
      `📣 **Promotional Message** (Ready to copy!)\n\n` +
      `---\n` +
      `🍜 *THE TASTE — Special Offer!*\n\n` +
      `Craving something delicious? Try our bestselling **${itemName}** — loved by ${topItem ? topItem[1] + '+ customers' : 'everyone'}!\n\n` +
      `🔥 Visit us today and enjoy amazing food at amazing prices!\n\n` +
      `📍 Order now at The Taste\n` +
      `---\n\n` +
      `*Copy and paste this to WhatsApp, Instagram, or any social platform!*`,
      null, ['📊 Summary', '🏆 Best Sellers']
    );
  }

  async detectAnomalies() {
    const todayOrders = await this.getOrdersInRange(0);
    const weekOrders = await this.getOrdersInRange(6);
    const todayRev = todayOrders.reduce((s, o) => s + (o.total || 0), 0);
    const avgRev = weekOrders.length > 0 ? weekOrders.reduce((s, o) => s + (o.total || 0), 0) / 7 : 0;
    const deviation = avgRev > 0 ? ((todayRev - avgRev) / avgRev * 100).toFixed(1) : 0;

    let text = `🔍 **Anomaly Detection**\n\n`;
    if (Math.abs(deviation) > 30) {
      text += `⚠️ **Significant deviation detected!**\n\n`;
      text += `Today's revenue (${this.formatCurrency(todayRev)}) is **${deviation > 0 ? '+' : ''}${deviation}%** `;
      text += deviation > 0 ? `above` : `below`;
      text += ` your weekly average (${this.formatCurrency(avgRev)}).\n`;
    } else {
      text += `✅ Everything looks normal today.\n\n`;
      text += `Revenue (${this.formatCurrency(todayRev)}) is within expected range of your weekly average (${this.formatCurrency(avgRev)}).`;
    }

    return this.formatResponse('text', text, null, ['📊 Summary', '📈 Forecast']);
  }
}

export const aiService = new AIService();
