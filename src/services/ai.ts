/**
 * ═══════════════════════════════════════════════════
 *  NextGenOS Restaurant Operating System
 *  Module: AI Service (3-Tier Architecture)
 *  Version: 2.0.0
 *  © 2026 NextGenOS. All Rights Reserved.
 *  This software is proprietary and confidential.
 *
 *  Tier 1 — Codebase AI: Offline keyword matching (reports, lookups)
 *  Tier 2 — Groq AI: Cloud LLM chat assistant (fast conversational)
 *  Tier 3 — Lightning AI: Complex analytical tasks (forecasting, anomaly)
 * ═══════════════════════════════════════════════════
 */

import { db, getSetting } from '../db/database';
import { parseOrderItems, safeCurrencySymbol } from '../utils/helpers';

// ── Intent Definitions with Tier Routing ──

const INTENTS = [
  // Tier 1 — Codebase AI (local, offline)
  { id: 'GENERATE_REPORT', tier: 'codebase', keywords: ['csv report', 'excel report', 'excel', 'download report', 'export', 'spreadsheet', 'sheet'], handler: 'generateReport' },
  { id: 'WHATSAPP_SHARE', tier: 'codebase', keywords: ['whatsapp bill', 'whatsapp', 'share bill', 'send bill', 'receipt message', 'bill on whatsapp'], handler: 'whatsappGuide' },
  { id: 'ORDER_COUNT', tier: 'codebase', keywords: ['orders', 'count', 'how many orders', 'total orders', 'number of orders'], handler: 'getOrderCount' },
  { id: 'CUSTOMER_COUNT', tier: 'codebase', keywords: ['customer', 'customers', 'visitor', 'how many people', 'footfall'], handler: 'getCustomerCount' },

  // Tier 2 — Groq AI (cloud chat — falls back to local)
  { id: 'REVENUE_TODAY', tier: 'groq', keywords: ['revenue', 'sales', 'earned', 'money', 'income', 'earning'], handler: 'getRevenueToday', fallback: 'getRevenueToday' },
  { id: 'BEST_SELLERS', tier: 'groq', keywords: ['best', 'top', 'popular', 'selling', 'seller', 'famous', 'trending'], handler: 'getBestSellers', fallback: 'getBestSellers' },
  { id: 'WORST_SELLERS', tier: 'groq', keywords: ['worst', 'least', 'slow', 'flop', 'not selling', 'poor'], handler: 'getWorstSellers', fallback: 'getWorstSellers' },
  { id: 'DAILY_SUMMARY', tier: 'groq', keywords: ['summary', 'overview', 'report', 'how was', 'day going', 'today'], handler: 'getDailySummary', fallback: 'getDailySummary' },
  { id: 'PEAK_HOURS', tier: 'groq', keywords: ['peak', 'busy', 'rush', 'busiest', 'hour', 'when'], handler: 'getPeakHours', fallback: 'getPeakHours' },
  { id: 'AVG_ORDER', tier: 'groq', keywords: ['average', 'avg', 'bill', 'ticket', 'order value', 'per order'], handler: 'getAvgOrderValue', fallback: 'getAvgOrderValue' },
  { id: 'PROMO', tier: 'groq', keywords: ['promo', 'marketing', 'message', 'offer', 'write', 'promotion', 'advertise'], handler: 'generatePromo', fallback: 'generatePromo' },
  { id: 'PAYMENT_SPLIT', tier: 'groq', keywords: ['payment', 'upi', 'cash', 'method', 'digital', 'split'], handler: 'getPaymentSplit', fallback: 'getPaymentSplit' },

  // Tier 3 — Lightning AI (complex compute — falls back to local)
  { id: 'FORECAST', tier: 'lightning', keywords: ['predict', 'forecast', 'tomorrow', 'expect', 'projection', 'estimate'], handler: 'forecastRevenue', fallback: 'forecastRevenue' },
  { id: 'ANOMALY', tier: 'lightning', keywords: ['unusual', 'anomaly', 'strange', 'weird', 'different', 'abnormal'], handler: 'detectAnomalies', fallback: 'detectAnomalies' },
];

class AIService {
  // Fields these methods assign. Type-only: `declare` emits nothing, so the
  // runtime shape of the class is unchanged.
  declare _configLoaded: any;
  declare conversationHistory: any;

  constructor() {
    this.conversationHistory = [];
    this._configLoaded = false;
  }

  // ── Config Loading ──

  async loadConfig() {
    if (this._configLoaded) return;
    this._configLoaded = true;
  }

  invalidateConfigCache() {
    this._configLoaded = false;
  }

  get isGroqAvailable() { return true; }
  get isLightningAvailable() { return true; }

  // ── Formatting Helpers ──

  formatCurrency(amount) {
    const symbol = safeCurrencySymbol(localStorage.getItem('app_currency_symbol'), '₹');
    const code = localStorage.getItem('app_currency_code') || 'INR';
    const locale = code === 'INR' ? 'en-IN' : (code === 'EUR' ? 'de-DE' : (code === 'GBP' ? 'en-GB' : (code === 'AUD' ? 'en-AU' : (code === 'CAD' ? 'en-CA' : 'en-US'))));
    return symbol + Number(amount || 0).toLocaleString(locale, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }

  formatResponse(type, content, data = null, suggestions = [], tier = 'codebase') {
    return { type, content, data, suggestions, tier, timestamp: new Date().toISOString() };
  }

  // ── Intent Classification ──

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

    return bestMatch || { id: 'DAILY_SUMMARY', tier: 'groq', handler: 'getDailySummary', fallback: 'getDailySummary' };
  }

  // ── Main Query Processor (3-Tier Router) ──

  async processQuery(query, queryEmbedding = null) {
    await this.loadConfig();

    try {
      const intent = this.classifyIntent(query);

      // Tier 1 — Codebase AI: always local
      if (intent.tier === 'codebase') {
        return await this[intent.handler](query);
      }

      // Tier 2 — Groq AI: try cloud, fallback to local
      if (intent.tier === 'groq') {
        const aiEnabled = await getSetting('enableAIChat');
        if (aiEnabled !== 'false') {
          try {
            return await this.queryGroq(query, intent, queryEmbedding);
          } catch (err) {
            console.warn('[AI] Groq call failed, falling back to local:', err.message);
          }
        }
        // Fallback to local handler
        return await this[intent.fallback || intent.handler](query);
      }

      // Tier 3 — Lightning AI: try cloud, fallback to local
      if (intent.tier === 'lightning') {
        // The Developer Console declares this flag off by default and draws the toggle that way.
        // Reading it as `!== 'false'` made an unset flag mean *on*, so a console showing AI
        // Analytics disabled was still calling Lightning. Opt-in means opt-in: only an explicit
        // 'true' turns it on.
        const analyticsEnabled = await getSetting('enableAIAnalytics');
        if (analyticsEnabled === 'true') {
          try {
            return await this.queryLightning(query, intent);
          } catch (err) {
            console.warn('[AI] Lightning call failed, falling back to local:', err.message);
          }
        }
        // Fallback to local handler
        return await this[intent.fallback || intent.handler](query);
      }

      // Default fallback
      return await this.getDailySummary();
    } catch (err) {
      console.error('AI query error:', err);
      return this.formatResponse('text',
        `I encountered an issue processing your request. Please try again.\n\n*Error: ${err.message}*`,
        null, ['📊 Today\'s Summary', '🏆 Best Sellers'], 'codebase'
      );
    }
  }

  // ── Cloud AI Callers ──

  // ── Cloud AI Callers ──

  async queryGroq(query, intent, queryEmbedding = null) {
    const context = await this.gatherBusinessContext();

    const systemPrompt = `You are an AI assistant for "${context.restaurantName || 'The Taste'}" restaurant.
You help restaurant staff with business insights, analytics, and operational questions.
Respond concisely in markdown. Use bold, emojis, and bullet points for readability.
Currency: ${context.currency}. Today: ${new Date().toLocaleDateString()}.

Current business data:
- Today's orders: ${context.todayOrders}, Revenue: ${context.todayRevenue}
- This week's orders: ${context.weekOrders}, Revenue: ${context.weekRevenue}
- Top sellers this week: ${context.topSellers}
- Payment methods breakdown: ${context.paymentBreakdown}`;

    this.conversationHistory.push({ role: 'user', content: query });
    if (this.conversationHistory.length > 10) {
      this.conversationHistory = this.conversationHistory.slice(-8);
    }

    return this.queryCloudAIChat(query, [
      { role: 'system', content: systemPrompt },
      ...this.conversationHistory
    ], intent, queryEmbedding);

  }

  async queryLightning(query, intent) {
    const { getSupabaseClient } = await import('./supabaseClient');
    const client = await getSupabaseClient({ persistSession: true });
    if (!client) throw new Error('Supabase client not available');
    const context = await this.gatherBusinessContext();
    const { data, error } = await client.functions.invoke('ai-chat', {
      body: {
        tier: 'lightning',
        query,
        intent: intent.id,
        context,
      },
    });
    if (error) throw error;
    if (!data?.ok) throw new Error(data?.error || 'Lightning AI cloud function failed');
    const content = data.result || data.content || data.message || JSON.stringify(data);

    return this.formatResponse('text', content, data,
      ['📊 Summary', '🔍 Detect Anomalies', '📈 Forecast'], 'lightning'
    );
  }

  async queryCloudAIChat(query, messages, intent, queryEmbedding = null) {
    const { getSupabaseClient } = await import('./supabaseClient');
    const client = await getSupabaseClient({ persistSession: true });
    if (!client) throw new Error('Supabase client not available');

    const context = await this.gatherBusinessContext();
    const payload = {
      tier: 'groq',
      messages,
      context: {
        query,
        queryEmbedding,
        restaurantName: context.restaurantName,
        currency: context.currency,
      }
    };

    const { data, error } = await client.functions.invoke('ai-chat', {
      body: payload
    });

    if (error) throw error;
    if (!data || !data.ok) throw new Error(data?.error || 'AI cloud function returned success: false');

    // Sync local conversation history with assistant response
    this.conversationHistory.push({ role: 'assistant', content: data.content });

    return this.formatResponse('text', data.content, null,
      ['📊 Today\'s Summary', '🏆 Best Sellers', '📈 Forecast Tomorrow'], 'groq'
    );
  }

  cosineSimilarity(a, b) {
    if (!a || !b || a.length !== b.length) return 0;
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    return normA && normB ? dot / (Math.sqrt(normA) * Math.sqrt(normB)) : 0;
  }

  // ── Business Context Gatherer ──

  async gatherBusinessContext() {
    const todayOrders = await this.getOrdersInRange(0);
    const weekOrders = await this.getOrdersInRange(6);
    const todayRevenue = todayOrders.reduce((s, o) => s + (o.total || 0), 0);
    const weekRevenue = weekOrders.reduce((s, o) => s + (o.total || 0), 0);

    // Top sellers
    const itemMap: Record<string, any> = {};
    weekOrders.forEach(o => {
      this.parseItems(o).forEach(item => {
        const name = item.itemName || item.name;
        if (!itemMap[name]) itemMap[name] = 0;
        itemMap[name] += item.quantity || 1;
      });
    });
    const topSellers = Object.entries(itemMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, qty]) => `${name}(${qty})`)
      .join(', ');

    // Payment breakdown
    const paymentMap: Record<string, any> = {};
    weekOrders.forEach(o => {
      const m = o.paymentMethod || 'unknown';
      paymentMap[m] = (paymentMap[m] || 0) + 1;
    });
    const paymentBreakdown = Object.entries(paymentMap)
      .map(([m, c]) => `${m}:${c}`)
      .join(', ');

    // Settings are the one source. `app_restaurant_name` was read here but written nowhere, so it
    // was always null — a first term that could only ever be skipped.
    const restaurantName = (await getSetting('restaurantName')) || 'The Taste';
    const currency = `${safeCurrencySymbol(localStorage.getItem('app_currency_symbol'), '₹')} ${String(localStorage.getItem('app_currency_code') || 'INR').replace(/[^A-Za-z]/g, '').slice(0, 5) || 'INR'}`;

    return {
      restaurantName,
      currency,
      todayOrders: todayOrders.length,
      todayRevenue: this.formatCurrency(todayRevenue),
      weekOrders: weekOrders.length,
      weekRevenue: this.formatCurrency(weekRevenue),
      topSellers: topSellers || 'No data',
      paymentBreakdown: paymentBreakdown || 'No data',
    };
  }

  // ── Connection Testers ──

  async testGroqConnection() {
    try {
      const { getSupabaseClient } = await import('./supabaseClient');
      const client = await getSupabaseClient({ persistSession: true });
      if (!client) return false;
      const { data, error } = await client.functions.invoke('ai-chat', {
        body: { tier: 'groq', messages: [{ role: 'user', content: 'Reply with connected.' }] },
      });
      return !error && Boolean(data?.ok);
    } catch { return false; }
  }

  async testLightningConnection() {
    try {
      const { getSupabaseClient } = await import('./supabaseClient');
      const client = await getSupabaseClient({ persistSession: true });
      if (!client) return false;
      const { data, error } = await client.functions.invoke('ai-chat', {
        body: { tier: 'lightning', query: 'ping', intent: 'test', context: {} },
      });
      return !error && Boolean(data?.ok);
    } catch { return false; }
  }

  // ── Data Helpers ──

  getDateRange(daysBack = 0) {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysBack);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    return { start: start.toISOString(), end: end.toISOString() };
  }

  async getOrdersInRange(daysBack = 0) {
    const { start, end } = this.getDateRange(daysBack);
    const orders = await db.orders.where('createdAt').between(start, end).toArray();
    return orders.filter(o => o.paymentStatus === 'paid');
  }

  parseItems(order) {
    return parseOrderItems(order.items);
  }

  // ── Tier 1: Codebase AI Intent Handlers (Offline) ──

  async getRevenueToday() {
    const orders = await this.getOrdersInRange(0);
    const revenue = orders.reduce((s, o) => s + (o.total || 0), 0);
    const count = orders.length;

    return this.formatResponse('text',
      `📊 **Today's Revenue**: ${this.formatCurrency(revenue)}\n\n` +
      `From **${count}** completed orders.\n` +
      (count > 0 ? `Average bill: ${this.formatCurrency(revenue / count)}` : 'No orders yet today.'),
      { revenue, count },
      ['🏆 Best Sellers', '⏰ Peak Hours', '📈 Forecast Tomorrow'],
      'codebase'
    );
  }

  async getBestSellers() {
    const orders = await this.getOrdersInRange(6);
    const itemMap: Record<string, any> = {};
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
      ['📊 Today\'s Summary', '📉 Worst Sellers', '💰 Revenue Today'],
      'codebase'
    );
  }

  async getWorstSellers() {
    const orders = await this.getOrdersInRange(6);
    const itemMap: Record<string, any> = {};
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
      ['🏆 Best Sellers', '📊 Today\'s Summary'],
      'codebase'
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
      .filter(o => o.paymentStatus === 'paid');
    const yRevenue = yesterdayOrders.reduce((s, o) => s + (o.total || 0), 0);
    const growth = yRevenue > 0 ? ((revenue - yRevenue) / yRevenue * 100) : 0;
    const growthText = growth.toFixed(1);
    const growthIcon = growth > 0 ? '📈' : growth < 0 ? '📉' : '➡️';

    // Top item today
    const itemMap: Record<string, any> = {};
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
    text += `${growthIcon} vs Yesterday: **${growth > 0 ? '+' : ''}${growthText}%**\n`;
    if (topItem) text += `🏆 Top Item: **${topItem[0]}** (${topItem[1]} sold)\n`;

    if (count === 0) text = `📋 **Today's Summary**\n\nNo orders yet today. The day is young! 🌅`;

    return this.formatResponse('text', text, { revenue, count, avg, growth },
      ['🏆 Best Sellers', '⏰ Peak Hours', '📈 Forecast Tomorrow'],
      'codebase'
    );
  }

  async getPeakHours() {
    const orders = await this.getOrdersInRange(6);
    const hourMap: Record<string, any> = {};
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
      ['📊 Today\'s Summary', '🏆 Best Sellers'],
      'codebase'
    );
  }

  async getOrderCount() {
    const orders = await this.getOrdersInRange(0);
    const allOrders = await db.orders.toArray();
    return this.formatResponse('text',
      `📦 **Order Count**\n\nToday: **${orders.length}** orders\nAll Time: **${allOrders.length}** orders`,
      null, ['💰 Revenue Today', '📊 Summary'],
      'codebase'
    );
  }

  async getAvgOrderValue() {
    const orders = await this.getOrdersInRange(6);
    const revenue = orders.reduce((s, o) => s + (o.total || 0), 0);
    const avg = orders.length > 0 ? revenue / orders.length : 0;
    return this.formatResponse('text',
      `🧾 **Average Order Value** (Last 7 Days)\n\n` +
      `Average bill: **${this.formatCurrency(avg)}**\nFrom ${orders.length} orders totalling ${this.formatCurrency(revenue)}`,
      null, ['📊 Summary', '🏆 Best Sellers'],
      'codebase'
    );
  }

  async forecastRevenue() {
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
      null, ['📊 Today\'s Summary', '⏰ Peak Hours'],
      'codebase'
    );
  }

  async getPaymentSplit() {
    const orders = await this.getOrdersInRange(6);
    const split: Record<string, any> = {};
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

    return this.formatResponse('text', text, null, ['📊 Summary', '💰 Revenue'],
      'codebase'
    );
  }

  async getCustomerCount() {
    const count = await db.customers.count();
    return this.formatResponse('text',
      `👥 **Customer Base**\n\nTotal registered customers: **${count}**\n\n` +
      (count === 0 ? '*Customers are auto-added when orders include phone numbers.*' : ''),
      null, ['📊 Summary'],
      'codebase'
    );
  }

  async generatePromo() {
    const orders = await this.getOrdersInRange(6);
    const itemMap: Record<string, any> = {};
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
      null, ['📊 Summary', '🏆 Best Sellers'],
      'codebase'
    );
  }

  async detectAnomalies() {
    const todayOrders = await this.getOrdersInRange(0);
    const weekOrders = await this.getOrdersInRange(6);
    const todayRev = todayOrders.reduce((s, o) => s + (o.total || 0), 0);
    const avgRev = weekOrders.length > 0 ? weekOrders.reduce((s, o) => s + (o.total || 0), 0) / 7 : 0;
    const deviation = avgRev > 0 ? ((todayRev - avgRev) / avgRev * 100) : 0;
    const deviationText = deviation.toFixed(1);

    let text = `🔍 **Anomaly Detection**\n\n`;
    if (Math.abs(deviation) > 30) {
      text += `⚠️ **Significant deviation detected!**\n\n`;
      text += `Today's revenue (${this.formatCurrency(todayRev)}) is **${deviation > 0 ? '+' : ''}${deviationText}%** `;
      text += deviation > 0 ? `above` : `below`;
      text += ` your weekly average (${this.formatCurrency(avgRev)}).\n`;
    } else {
      text += `✅ Everything looks normal today.\n\n`;
      text += `Revenue (${this.formatCurrency(todayRev)}) is within expected range of your weekly average (${this.formatCurrency(avgRev)}).`;
    }

    return this.formatResponse('text', text, null, ['📊 Summary', '📈 Forecast'],
      'codebase'
    );
  }

  async generateReport(query) {
    const lower = query.toLowerCase();
    let type = 'daily';
    if (lower.includes('week')) type = 'weekly';
    else if (lower.includes('month')) type = 'monthly';

    try {
      const { generateDailyReport, generateWeeklyReport, generateMonthlyReport, downloadReport } = await import('./reportGenerator');
      const now = new Date();
      let blob, filename;
      
      if (type === 'daily') {
        const todayStr = now.toISOString().split('T')[0];
        blob = await generateDailyReport(todayStr);
        filename = `Daily_Report_${todayStr}.csv`;
      } else if (type === 'weekly') {
        const todayStr = now.toISOString().split('T')[0];
        blob = await generateWeeklyReport(todayStr);
        filename = `Weekly_Report_${todayStr}.csv`;
      } else if (type === 'monthly') {
        const month = now.getMonth();
        const year = now.getFullYear();
        blob = await generateMonthlyReport(month, year);
        const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
        filename = `Monthly_Report_${monthNames[month]}_${year}.csv`;
      }

      if (blob) {
        downloadReport(blob, filename);
        return this.formatResponse('text',
          `📊 **CSV Report Generated!**\n\n` +
          `I have successfully generated and triggered a download for your **${type.toUpperCase()}** report: \`${filename}\`.\n\n` +
          `It contains sheets for:\n` +
          `• **Summary KPIs**\n` +
          `• **Order Details**\n` +
          `• **Item Sales Analysis**`,
          { type, filename },
          ['📊 Today\'s CSV Report', '📈 Weekly CSV Report', '📅 Monthly CSV Report', '🏆 Best Sellers'],
          'codebase'
        );
      }
    } catch (err) {
      console.error('[AI] Report generation error:', err);
      return this.formatResponse('text',
        `❌ **Failed to generate CSV report**\n\n` +
        `Error: ${err.message}`,
        null,
        ['📊 Today\'s Summary', '🏆 Best Sellers'],
        'codebase'
      );
    }
  }

  async whatsappGuide() {
    return this.formatResponse('text',
      `📱 **WhatsApp Bill Sharing Guide**\n\n` +
      `You can share beautiful, formatted receipts directly with customers on WhatsApp for free!\n\n` +
      `**How it works:**\n` +
      `1. Open **Orders** logs.\n` +
      `2. Select any order to open the **Receipt Inspector**.\n` +
      `3. Tap the **📱 Send on WhatsApp** button.\n` +
      `4. Enter the customer's phone number and hit OK.\n\n` +
      `The app will open a WhatsApp chat window with the pre-formatted text receipt ready to send!`,
      null,
      ['📋 Today\'s Summary', '📊 Generate Report', '🏆 Best Sellers'],
      'codebase'
    );
  }
}

export const aiService = new AIService();
