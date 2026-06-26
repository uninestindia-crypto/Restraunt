// @ts-nocheck
import { getSupabaseClient } from './supabaseClient';

function normalizeItemsForPublicOrder(items) {
  if (typeof items === 'string') {
    try {
      items = JSON.parse(items);
    } catch (_error) {
      items = [];
    }
  }
  if (!Array.isArray(items)) return [];
  return items.map(item => ({
    itemId: Number(item.itemId || item.id),
    quantity: Math.max(1, Math.min(50, Number(item.quantity) || 1)),
    notes: String(item.notes || '').slice(0, 240)
  })).filter(item => Number.isFinite(item.itemId) && item.itemId > 0);
}

export function buildPublicOrderPayload(order) {
  return {
    clientOrderId: order.clientOrderId,
    idempotencyKey: order.idempotencyKey || order.clientOrderId,
    type: order.type,
    channel: order.channel,
    source: order.source,
    tableId: order.tableId || null,
    customer: {
      name: order.customerName,
      phone: order.customerPhone
    },
    delivery: {
      address: order.deliveryAddress || '',
      landmark: order.deliveryLandmark || '',
      notes: order.deliveryNotes || ''
    },
    payment: {
      method: order.paymentMethod
    },
    items: normalizeItemsForPublicOrder(order.items)
  };
}

export function mapRemotePublicOrder(row, fallback = {}) {
  if (!row) return fallback;
  return {
    ...fallback,
    serverOrderId: row.id || fallback.serverOrderId || null,
    clientOrderId: row.client_order_id || fallback.clientOrderId,
    idempotencyKey: row.idempotency_key || fallback.idempotencyKey,
    orderNumber: row.order_number || fallback.orderNumber,
    displayToken: row.display_token || fallback.displayToken,
    type: row.type || fallback.type,
    channel: row.channel || fallback.channel,
    source: row.source || fallback.source,
    status: row.status || fallback.status,
    items: row.items || fallback.items,
    subtotal: Number(row.subtotal ?? fallback.subtotal ?? 0),
    tax: Number(row.tax ?? fallback.tax ?? 0),
    taxPercent: Number(row.tax_percent ?? fallback.taxPercent ?? 0),
    deliveryFee: Number(row.delivery_fee ?? fallback.deliveryFee ?? 0),
    total: Number(row.total ?? fallback.total ?? 0),
    paymentMethod: row.payment_method || fallback.paymentMethod,
    paymentStatus: row.payment_status || fallback.paymentStatus,
    customerName: row.customer_name || fallback.customerName,
    customerPhone: row.customer_phone || fallback.customerPhone,
    deliveryAddress: row.delivery_address || fallback.deliveryAddress,
    deliveryLandmark: row.delivery_landmark || fallback.deliveryLandmark,
    deliveryNotes: row.delivery_notes || fallback.deliveryNotes,
    deliveryStatus: row.delivery_status || fallback.deliveryStatus,
    tableId: row.table_id || fallback.tableId || null,
    createdAt: row.created_at || fallback.createdAt,
    updatedAt: row.updated_at || fallback.updatedAt,
    syncStatus: 'synced',
    validationStatus: 'accepted',
    requiresServerValidation: false,
    lastSyncError: '',
    isSynced: 1
  };
}

export async function submitPublicOrder(order) {
  const client = await getSupabaseClient({ persistSession: true });
  if (!client) {
    return { accepted: false, offline: true, message: 'Supabase is not configured.' };
  }

  const payload = buildPublicOrderPayload(order);
  const { data, error } = await client.functions.invoke('public-order', { body: payload });
  if (error) {
    return { accepted: false, message: error.message || String(error) };
  }
  if (!data?.order) {
    return { accepted: false, message: data?.error || 'Public order function returned no order.' };
  }

  return {
    accepted: true,
    order: mapRemotePublicOrder(data.order, order),
    warnings: data.warnings || []
  };
}
