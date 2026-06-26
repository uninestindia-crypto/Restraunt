// @ts-nocheck
/**
 * ═══════════════════════════════════════════════════
 *  NextGenOS Restaurant Operating System
 *  Module: Analytics Service
 *  Version: 2.0.0
 *  © 2026 NextGenOS. All Rights Reserved.
 *  This software is proprietary and confidential.
 * ═══════════════════════════════════════════════════
 */

import { db } from '../db/database';
import { parseOrderItems } from '../utils/helpers';

class AnalyticsService {

  getDateRange(daysBack = 0) {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysBack);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    return { start: start.toISOString(), end: end.toISOString() };
  }

  async getCompletedOrders(startISO, endISO) {
    try {
      const orders = await db.orders.where('createdAt').between(startISO, endISO).toArray();
      return orders.filter(o => o.paymentStatus === 'paid');
    } catch (error) {
      console.error('[AnalyticsService] Dexie database error in getCompletedOrders:', error);
      return [];
    }
  }

  async getRevenueByPeriod(daysBack = 0) {
    const { start, end } = this.getDateRange(daysBack);
    const orders = await this.getCompletedOrders(start, end);
    return {
      revenue: orders.reduce((s, o) => s + (o.total || 0), 0),
      orders: orders.length,
      avg: orders.length > 0 ? orders.reduce((s, o) => s + (o.total || 0), 0) / orders.length : 0,
    };
  }

  async getRevenueTrend(days = 7) {
    const trend = [];
    for (let d = days - 1; d >= 0; d--) {
      const now = new Date();
      const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - d);
      const start = date.toISOString();
      const end = new Date(date.getTime() + 86400000).toISOString();
      const orders = await this.getCompletedOrders(start, end);
      trend.push({
        date: date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric' }),
        dateObj: date,
        revenue: orders.reduce((s, o) => s + (o.total || 0), 0),
        orders: orders.length,
      });
    }
    return trend;
  }

  async getHourlyRevenue(daysBack = 0) {
    const { start, end } = this.getDateRange(daysBack);
    const orders = await this.getCompletedOrders(start, end);
    const hourly = Array.from({ length: 24 }, (_, i) => ({ hour: i, revenue: 0, orders: 0 }));
    orders.forEach(o => {
      const h = new Date(o.createdAt).getHours();
      hourly[h].revenue += o.total || 0;
      hourly[h].orders += 1;
    });
    return hourly;
  }

  async getTopItems(daysBack = 6, limit = 10) {
    const { start, end } = this.getDateRange(daysBack);
    const orders = await this.getCompletedOrders(start, end);
    const map = {};
    orders.forEach(o => {
      const items = parseOrderItems(o.items);
      items.forEach(item => {
        const name = item.itemName || item.name;
        if (!map[name]) map[name] = { qty: 0, revenue: 0 };
        map[name].qty += item.quantity || 1;
        map[name].revenue += (item.price || 0) * (item.quantity || 1);
      });
    });
    return Object.entries(map)
      .map(([name, d]) => ({ name, ...d }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, limit);
  }

  async getPaymentBreakdown(daysBack = 0) {
    const { start, end } = this.getDateRange(daysBack);
    const orders = await this.getCompletedOrders(start, end);
    const breakdown = {};
    orders.forEach(o => {
      const m = o.paymentMethod || 'unknown';
      if (!breakdown[m]) breakdown[m] = { count: 0, total: 0 };
      breakdown[m].count += 1;
      breakdown[m].total += o.total || 0;
    });
    return breakdown;
  }

  async getOrderTypeSplit(daysBack = 0) {
    const { start, end } = this.getDateRange(daysBack);
    const orders = await this.getCompletedOrders(start, end);
    const split = {};
    orders.forEach(o => {
      const t = o.type || 'takeaway';
      if (!split[t]) split[t] = { count: 0, total: 0 };
      split[t].count += 1;
      split[t].total += o.total || 0;
    });
    return split;
  }

  async getGrowthRate(currentDays = 7, prevDays = 7) {
    const current = await this.getRevenueByPeriod(currentDays - 1);
    const now = new Date();
    const prevStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - currentDays - prevDays);
    const prevEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() - currentDays);
    const prevOrders = await this.getCompletedOrders(prevStart.toISOString(), prevEnd.toISOString());
    const prevRevenue = prevOrders.reduce((s, o) => s + (o.total || 0), 0);
    return prevRevenue > 0 ? ((current.revenue - prevRevenue) / prevRevenue * 100) : 0;
  }
}

export const analyticsService = new AnalyticsService();
