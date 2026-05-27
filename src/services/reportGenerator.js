import { db, getSetting } from '../db/database.js';
import { parseOrderItems } from '../utils/helpers.js';

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

function isPaid(order) {
  return order.paymentStatus === 'paid';
}

function compileMetrics(orders) {
  const metrics = {
    totalOrders: orders.length,
    totalRevenue: 0,
    cashRevenue: 0,
    upiRevenue: 0,
    dineInOrders: 0,
    takeawayOrders: 0,
    deliveryOrders: 0,
    paidCount: 0,
    unpaidCount: 0,
    avgOrderValue: 0,
    itemMap: {}
  };

  for (const order of orders) {
    const paid = isPaid(order);
    if (paid) {
      metrics.totalRevenue += order.total || 0;
      metrics.paidCount += 1;
      if (order.paymentMethod === 'cash') metrics.cashRevenue += order.total || 0;
      if (order.paymentMethod === 'upi') metrics.upiRevenue += order.total || 0;
    } else {
      metrics.unpaidCount += 1;
    }

    if (order.type === 'dinein') metrics.dineInOrders += 1;
    else if (order.type === 'delivery') metrics.deliveryOrders += 1;
    else metrics.takeawayOrders += 1;

    for (const item of parseOrderItems(order.items)) {
      const name = item.itemName || item.name || 'Unknown Item';
      if (!metrics.itemMap[name]) {
        metrics.itemMap[name] = { name, quantity: 0, revenue: 0, category: item.categoryName || 'General' };
      }
      metrics.itemMap[name].quantity += item.quantity || 0;
      if (paid) metrics.itemMap[name].revenue += (item.price || 0) * (item.quantity || 0);
    }
  }

  metrics.avgOrderValue = metrics.paidCount > 0 ? metrics.totalRevenue / metrics.paidCount : 0;
  return metrics;
}

function csvField(value) {
  const str = String(value ?? '');
  if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

function addSection(lines, title, rows) {
  lines.push([title].map(csvField).join(','));
  for (const row of rows) lines.push(row.map(csvField).join(','));
  lines.push('');
}

async function buildReportCsv(title, label, orders) {
  const restaurantName = await getSetting('restaurantName') || 'The Taste';
  const metrics = compileMetrics(orders);
  const lines = [];

  addSection(lines, title, [
    ['Restaurant', restaurantName],
    ['Range', label],
    ['Generated At', new Date().toISOString()]
  ]);

  addSection(lines, 'Summary KPIs', [
    ['Metric', 'Value'],
    ['Total Orders Placed', metrics.totalOrders],
    ['Total Revenue Paid', metrics.totalRevenue],
    ['Average Bill Value', metrics.avgOrderValue],
    ['Paid Orders', metrics.paidCount],
    ['Unpaid/Pending Orders', metrics.unpaidCount],
    ['UPI Payments', metrics.upiRevenue],
    ['Cash Payments', metrics.cashRevenue],
    ['Dine-In Orders', metrics.dineInOrders],
    ['Pickup Orders', metrics.takeawayOrders],
    ['Delivery Orders', metrics.deliveryOrders]
  ]);

  addSection(lines, 'Order Details', [
    ['Order Number', 'Date', 'Time', 'Type', 'Customer', 'Phone', 'Items', 'Subtotal', 'Tax', 'Delivery Fee', 'Total', 'Payment Method', 'Payment Status', 'Kitchen Status', 'Delivery Status'],
    ...orders.map(order => {
      const created = order.createdAt ? new Date(order.createdAt) : null;
      const itemsText = parseOrderItems(order.items).map(item => `${item.itemName || item.name} x${item.quantity || 1}`).join('; ');
      return [
        order.orderNumber,
        created ? created.toLocaleDateString('en-IN') : '',
        created ? created.toLocaleTimeString('en-IN') : '',
        order.type || '',
        order.customerName || '',
        order.customerPhone || '',
        itemsText,
        order.subtotal || 0,
        order.tax || 0,
        order.deliveryFee || 0,
        order.total || 0,
        order.paymentMethod || '',
        order.paymentStatus || 'unpaid',
        order.status || '',
        order.deliveryStatus || ''
      ];
    })
  ]);

  addSection(lines, 'Item Analysis', [
    ['Item Name', 'Category', 'Quantity Sold', 'Revenue Paid'],
    ...Object.values(metrics.itemMap)
      .sort((a, b) => b.quantity - a.quantity)
      .map(item => [item.name, item.category, item.quantity, item.revenue])
  ]);

  return new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
}

export async function generateDailyReport(dateStr) {
  const start = new Date(dateStr);
  start.setHours(0, 0, 0, 0);
  const end = new Date(dateStr);
  end.setHours(23, 59, 59, 999);
  const orders = await getOrdersForRange(start.toISOString(), end.toISOString());
  return buildReportCsv('THE TASTE POS - DAILY BUSINESS REPORT', dateStr, orders);
}

export async function generateWeeklyReport(endDateStr) {
  const end = new Date(endDateStr);
  end.setHours(23, 59, 59, 999);
  const start = new Date(end);
  start.setDate(end.getDate() - 6);
  start.setHours(0, 0, 0, 0);
  const orders = await getOrdersForRange(start.toISOString(), end.toISOString());
  return buildReportCsv('THE TASTE POS - WEEKLY BUSINESS REPORT', `${start.toLocaleDateString('en-IN')} to ${end.toLocaleDateString('en-IN')}`, orders);
}

export async function generateMonthlyReport(month, year) {
  const start = new Date(year, month, 1, 0, 0, 0, 0);
  const end = new Date(year, month + 1, 0, 23, 59, 59, 999);
  const orders = await getOrdersForRange(start.toISOString(), end.toISOString());
  const label = start.toLocaleString('en-IN', { month: 'long', year: 'numeric' });
  return buildReportCsv('THE TASTE POS - MONTHLY BUSINESS REPORT', label, orders);
}
