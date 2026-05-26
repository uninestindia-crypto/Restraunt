/**
 * ═══════════════════════════════════════════════════
 *  The Taste POS — Report Generator Service
 *  Module: Excel (.xlsx) Report Creation
 *  Version: 1.0.0
 *  © 2026 The Taste. All Rights Reserved.
 * ═══════════════════════════════════════════════════
 */

import * as XLSX from 'xlsx';
import { db, getSetting } from '../db/database.js';

/**
 * Get orders in a specific date range.
 * @param {string} startDate - ISO string
 * @param {string} endDate - ISO string
 * @returns {Promise<Array>} Orders array
 */
export async function getOrdersForRange(startDate, endDate) {
  try {
    return await db.orders
      .where('createdAt')
      .between(startDate, endDate, true, true)
      .toArray();
  } catch (error) {
    console.error('[ReportGenerator] Error fetching orders for range:', error);
    return [];
  }
}

/**
 * Helper to download a blob in browser
 * @param {Blob} blob - Binary Excel data
 * @param {string} filename - Name of the file
 */
export function downloadReport(blob, filename) {
  if (typeof window === 'undefined') return;
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}

/**
 * Standard summary and data extraction logic.
 * @param {Array} orders - Orders list
 * @returns {Object} Extracted metrics and item mappings
 */
function compileMetrics(orders) {
  let totalOrders = orders.length;
  let totalRevenue = 0;
  let cashRevenue = 0;
  let upiRevenue = 0;
  let dineInOrders = 0;
  let takeawayOrders = 0;
  let paidCount = 0;
  let unpaidCount = 0;

  const itemMap = {};

  orders.forEach(order => {
    const isPaid = order.paymentStatus === 'paid' || order.status === 'completed';
    if (isPaid) {
      totalRevenue += order.total || 0;
      paidCount++;
      if (order.paymentMethod === 'cash') {
        cashRevenue += order.total || 0;
      } else if (order.paymentMethod === 'upi') {
        upiRevenue += order.total || 0;
      }
    } else {
      unpaidCount++;
    }

    if (order.type === 'dine_in') {
      dineInOrders++;
    } else {
      takeawayOrders++;
    }

    // Item aggregation
    if (Array.isArray(order.items)) {
      order.items.forEach(item => {
        const key = item.name || 'Unknown Item';
        if (!itemMap[key]) {
          itemMap[key] = {
            name: key,
            quantity: 0,
            revenue: 0,
            category: item.categoryName || 'General'
          };
        }
        itemMap[key].quantity += item.quantity || 0;
        if (isPaid) {
          itemMap[key].revenue += (item.price * item.quantity) || 0;
        }
      });
    }
  });

  const avgOrderValue = paidCount > 0 ? totalRevenue / paidCount : 0;

  return {
    totalOrders,
    totalRevenue,
    cashRevenue,
    upiRevenue,
    dineInOrders,
    takeawayOrders,
    paidCount,
    unpaidCount,
    avgOrderValue,
    itemMap
  };
}

/**
 * Generate Daily Report Excel Workbook
 * @param {string} dateStr - YYYY-MM-DD
 * @returns {Promise<Blob>} Excel file blob
 */
export async function generateDailyReport(dateStr) {
  const start = new Date(dateStr);
  start.setHours(0, 0, 0, 0);
  const end = new Date(dateStr);
  end.setHours(23, 59, 59, 999);

  const orders = await getOrdersForRange(start.toISOString(), end.toISOString());
  const metrics = compileMetrics(orders);
  const restaurantName = (await getSetting('restaurantName')) || 'The Taste';

  const wb = XLSX.utils.book_new();

  // 1. Summary Sheet
  const summaryData = [
    ['THE TASTE POS — DAILY BUSINESS REPORT'],
    [`Restaurant: ${restaurantName}`],
    [`Report Date: ${dateStr}`],
    [],
    ['KEY PERFORMANCE INDICATORS', 'VALUE'],
    ['Total Orders Placed', metrics.totalOrders],
    ['Total Revenue (Paid)', metrics.totalRevenue],
    ['Average Bill Value', metrics.avgOrderValue],
    ['Paid Orders', metrics.paidCount],
    ['Unpaid/Pending Orders', metrics.unpaidCount],
    [],
    ['REVENUE SPLIT', 'VALUE'],
    ['UPI Payments', metrics.upiRevenue],
    ['Cash Payments', metrics.cashRevenue],
    [],
    ['ORDER TYPE SPLIT', 'VALUE'],
    ['Dine-in Orders', metrics.dineInOrders],
    ['Takeaway Orders', metrics.takeawayOrders]
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

  // 2. Order Details Sheet
  const orderHeaders = [
    'Order Number', 'Time', 'Type', 'Items Summary', 
    'Subtotal', 'Tax', 'Total', 'Payment Method', 'Payment Status', 'Status', 'Notes'
  ];
  const orderRows = orders.map(o => {
    const itemsText = Array.isArray(o.items)
      ? o.items.map(item => `${item.name} x${item.quantity}`).join(', ')
      : '';
    const timeText = o.createdAt ? new Date(o.createdAt).toLocaleTimeString() : '';
    return [
      o.orderNumber,
      timeText,
      o.type === 'dine_in' ? 'Dine-In' : 'Takeaway',
      itemsText,
      o.subtotal || 0,
      o.tax || 0,
      o.total || 0,
      o.paymentMethod ? o.paymentMethod.toUpperCase() : 'N/A',
      o.paymentStatus ? o.paymentStatus.toUpperCase() : 'UNPAID',
      o.status ? o.status.toUpperCase() : 'PENDING',
      o.notes || ''
    ];
  });
  const wsOrders = XLSX.utils.aoa_to_sheet([orderHeaders, ...orderRows]);
  XLSX.utils.book_append_sheet(wb, wsOrders, 'Order Details');

  // 3. Item Analysis Sheet
  const itemHeaders = ['Item Name', 'Category', 'Quantity Sold', 'Revenue Generated'];
  const itemRows = Object.values(metrics.itemMap)
    .sort((a, b) => b.quantity - a.quantity)
    .map(item => [
      item.name,
      item.category,
      item.quantity,
      item.revenue
    ]);
  const wsItems = XLSX.utils.aoa_to_sheet([itemHeaders, ...itemRows]);
  XLSX.utils.book_append_sheet(wb, wsItems, 'Item Analysis');

  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([wbout], { type: 'application/octet-stream' });
}

/**
 * Generate Weekly Report Excel Workbook
 * @param {string} endDateStr - Ending Date YYYY-MM-DD
 * @returns {Promise<Blob>} Excel file blob
 */
export async function generateWeeklyReport(endDateStr) {
  const end = new Date(endDateStr);
  end.setHours(23, 59, 59, 999);
  
  const start = new Date(end);
  start.setDate(end.getDate() - 6);
  start.setHours(0, 0, 0, 0);

  const orders = await getOrdersForRange(start.toISOString(), end.toISOString());
  const metrics = compileMetrics(orders);
  const restaurantName = (await getSetting('restaurantName')) || 'The Taste';

  // Day-by-day analysis
  const dayBreakdown = {};
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const dayKey = d.toISOString().split('T')[0];
    dayBreakdown[dayKey] = { orders: 0, revenue: 0 };
  }

  orders.forEach(o => {
    const dayKey = o.createdAt.split('T')[0];
    if (dayBreakdown[dayKey]) {
      dayBreakdown[dayKey].orders++;
      if (o.paymentStatus === 'paid' || o.status === 'completed') {
        dayBreakdown[dayKey].revenue += o.total || 0;
      }
    }
  });

  const wb = XLSX.utils.book_new();

  // 1. Summary Sheet
  const rangeStr = `${start.toLocaleDateString()} to ${end.toLocaleDateString()}`;
  const summaryData = [
    ['THE TASTE POS — WEEKLY BUSINESS REPORT'],
    [`Restaurant: ${restaurantName}`],
    [`Report Range: ${rangeStr}`],
    [],
    ['KEY PERFORMANCE INDICATORS', 'VALUE'],
    ['Total Orders Placed', metrics.totalOrders],
    ['Total Revenue (Paid)', metrics.totalRevenue],
    ['Average Bill Value', metrics.avgOrderValue],
    ['Paid Orders', metrics.paidCount],
    ['Unpaid/Pending Orders', metrics.unpaidCount],
    [],
    ['REVENUE SPLIT', 'VALUE'],
    ['UPI Payments', metrics.upiRevenue],
    ['Cash Payments', metrics.cashRevenue],
    [],
    ['ORDER TYPE SPLIT', 'VALUE'],
    ['Dine-in Orders', metrics.dineInOrders],
    ['Takeaway Orders', metrics.takeawayOrders]
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

  // 2. Day-over-Day Trend
  const trendHeaders = ['Date', 'Day of Week', 'Orders Placed', 'Revenue (Paid)'];
  const trendRows = Object.entries(dayBreakdown).map(([date, data]) => {
    const dayName = new Date(date).toLocaleDateString(undefined, { weekday: 'long' });
    return [date, dayName, data.orders, data.revenue];
  });
  const wsTrend = XLSX.utils.aoa_to_sheet([trendHeaders, ...trendRows]);
  XLSX.utils.book_append_sheet(wb, wsTrend, 'Daily Breakdown');

  // 3. Order Details Sheet
  const orderHeaders = [
    'Order Number', 'Date', 'Time', 'Type', 'Items Summary', 
    'Subtotal', 'Tax', 'Total', 'Payment Method', 'Payment Status', 'Status', 'Notes'
  ];
  const orderRows = orders.map(o => {
    const itemsText = Array.isArray(o.items)
      ? o.items.map(item => `${item.name} x${item.quantity}`).join(', ')
      : '';
    const dateText = o.createdAt ? new Date(o.createdAt).toLocaleDateString() : '';
    const timeText = o.createdAt ? new Date(o.createdAt).toLocaleTimeString() : '';
    return [
      o.orderNumber,
      dateText,
      timeText,
      o.type === 'dine_in' ? 'Dine-In' : 'Takeaway',
      itemsText,
      o.subtotal || 0,
      o.tax || 0,
      o.total || 0,
      o.paymentMethod ? o.paymentMethod.toUpperCase() : 'N/A',
      o.paymentStatus ? o.paymentStatus.toUpperCase() : 'UNPAID',
      o.status ? o.status.toUpperCase() : 'PENDING',
      o.notes || ''
    ];
  });
  const wsOrders = XLSX.utils.aoa_to_sheet([orderHeaders, ...orderRows]);
  XLSX.utils.book_append_sheet(wb, wsOrders, 'Order Details');

  // 4. Item Analysis Sheet
  const itemHeaders = ['Item Name', 'Category', 'Quantity Sold', 'Revenue Generated'];
  const itemRows = Object.values(metrics.itemMap)
    .sort((a, b) => b.quantity - a.quantity)
    .map(item => [
      item.name,
      item.category,
      item.quantity,
      item.revenue
    ]);
  const wsItems = XLSX.utils.aoa_to_sheet([itemHeaders, ...itemRows]);
  XLSX.utils.book_append_sheet(wb, wsItems, 'Item Analysis');

  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([wbout], { type: 'application/octet-stream' });
}

/**
 * Generate Monthly Report Excel Workbook
 * @param {number} month - 0-indexed month (0 = Jan, 11 = Dec)
 * @param {number} year - YYYY
 * @returns {Promise<Blob>} Excel file blob
 */
export async function generateMonthlyReport(month, year) {
  const start = new Date(year, month, 1, 0, 0, 0, 0);
  const end = new Date(year, month + 1, 0, 23, 59, 59, 999);

  const orders = await getOrdersForRange(start.toISOString(), end.toISOString());
  const metrics = compileMetrics(orders);
  const restaurantName = (await getSetting('restaurantName')) || 'The Taste';

  // Day-by-day analysis for month
  const numDays = end.getDate();
  const dailyBreakdown = {};
  for (let i = 1; i <= numDays; i++) {
    const dayStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
    dailyBreakdown[dayStr] = { orders: 0, revenue: 0 };
  }

  orders.forEach(o => {
    const dayKey = o.createdAt.split('T')[0];
    if (dailyBreakdown[dayKey]) {
      dailyBreakdown[dayKey].orders++;
      if (o.paymentStatus === 'paid' || o.status === 'completed') {
        dailyBreakdown[dayKey].revenue += o.total || 0;
      }
    }
  });

  const wb = XLSX.utils.book_new();

  // 1. Summary Sheet
  const monthName = start.toLocaleString(undefined, { month: 'long' });
  const summaryData = [
    ['THE TASTE POS — MONTHLY BUSINESS REPORT'],
    [`Restaurant: ${restaurantName}`],
    [`Report Month: ${monthName} ${year}`],
    [],
    ['KEY PERFORMANCE INDICATORS', 'VALUE'],
    ['Total Orders Placed', metrics.totalOrders],
    ['Total Revenue (Paid)', metrics.totalRevenue],
    ['Average Bill Value', metrics.avgOrderValue],
    ['Paid Orders', metrics.paidCount],
    ['Unpaid/Pending Orders', metrics.unpaidCount],
    [],
    ['REVENUE SPLIT', 'VALUE'],
    ['UPI Payments', metrics.upiRevenue],
    ['Cash Payments', metrics.cashRevenue],
    [],
    ['ORDER TYPE SPLIT', 'VALUE'],
    ['Dine-in Orders', metrics.dineInOrders],
    ['Takeaway Orders', metrics.takeawayOrders]
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

  // 2. Daily Breakdown
  const trendHeaders = ['Date', 'Orders Placed', 'Revenue (Paid)'];
  const trendRows = Object.entries(dailyBreakdown).map(([date, data]) => [
    date, data.orders, data.revenue
  ]);
  const wsTrend = XLSX.utils.aoa_to_sheet([trendHeaders, ...trendRows]);
  XLSX.utils.book_append_sheet(wb, wsTrend, 'Daily Breakdown');

  // 3. Order Details Sheet
  const orderHeaders = [
    'Order Number', 'Date', 'Time', 'Type', 'Items Summary', 
    'Subtotal', 'Tax', 'Total', 'Payment Method', 'Payment Status', 'Status', 'Notes'
  ];
  const orderRows = orders.map(o => {
    const itemsText = Array.isArray(o.items)
      ? o.items.map(item => `${item.name} x${item.quantity}`).join(', ')
      : '';
    const dateText = o.createdAt ? new Date(o.createdAt).toLocaleDateString() : '';
    const timeText = o.createdAt ? new Date(o.createdAt).toLocaleTimeString() : '';
    return [
      o.orderNumber,
      dateText,
      timeText,
      o.type === 'dine_in' ? 'Dine-In' : 'Takeaway',
      itemsText,
      o.subtotal || 0,
      o.tax || 0,
      o.total || 0,
      o.paymentMethod ? o.paymentMethod.toUpperCase() : 'N/A',
      o.paymentStatus ? o.paymentStatus.toUpperCase() : 'UNPAID',
      o.status ? o.status.toUpperCase() : 'PENDING',
      o.notes || ''
    ];
  });
  const wsOrders = XLSX.utils.aoa_to_sheet([orderHeaders, ...orderRows]);
  XLSX.utils.book_append_sheet(wb, wsOrders, 'Order Details');

  // 4. Item Analysis Sheet
  const itemHeaders = ['Item Name', 'Category', 'Quantity Sold', 'Revenue Generated'];
  const itemRows = Object.values(metrics.itemMap)
    .sort((a, b) => b.quantity - a.quantity)
    .map(item => [
      item.name,
      item.category,
      item.quantity,
      item.revenue
    ]);
  const wsItems = XLSX.utils.aoa_to_sheet([itemHeaders, ...itemRows]);
  XLSX.utils.book_append_sheet(wb, wsItems, 'Item Analysis');

  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([wbout], { type: 'application/octet-stream' });
}
