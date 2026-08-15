import { db, getOrder, updateOrderFields } from '../db/database';
import { parseOrderItems } from '../utils/helpers';
import { getSupabaseClient } from './supabaseClient';

export const TRACKING_STEPS = [
  { key: 'received', label: 'Received', icon: 'receipt_long' },
  { key: 'accepted', label: 'Accepted', icon: 'verified' },
  { key: 'cooking', label: 'Cooking', icon: 'skillet' },
  { key: 'ready', label: 'Ready', icon: 'room_service' },
  { key: 'delivery', label: 'On the way', icon: 'local_shipping' },
  { key: 'completed', label: 'Completed', icon: 'check_circle' },
];

export const FALLBACK_OFFERS = [
  {
    id: 'local-wok-sip',
    code: 'WOKSIP',
    title: 'Wok & sip',
    label: 'Combo favourite',
    description: 'Pair selected noodles with a chilled drink for a better-value meal.',
    displayValue: 'Server validates at checkout',
    icon: 'lunch_dining',
    source: 'local',
  },
  {
    id: 'local-table-feast',
    code: 'TABLEFEAST',
    title: 'Table feast',
    label: 'Made for sharing',
    description: 'A generous spread for starters, mains, rice, and beverages.',
    displayValue: 'Serves 4',
    icon: 'groups',
    source: 'local',
  },
  {
    id: 'local-rewards',
    code: 'REWARDS',
    title: 'Points on every order',
    label: 'Taste Rewards',
    description: 'Sign in before checkout and grow your rewards balance with every meal.',
    displayValue: 'Members',
    icon: 'workspace_premium',
    source: 'local',
  },
];

export const RETENTION_PREFERENCES = [
  { key: 'whatsapp_updates', label: 'WhatsApp order updates', icon: 'chat', channel: 'whatsapp' },
  { key: 'push_updates', label: 'Push notifications', icon: 'notifications', channel: 'push' },
  { key: 'birthday_rewards', label: 'Birthday rewards', icon: 'cake', channel: 'loyalty' },
  { key: 'referral_rewards', label: 'Referral rewards', icon: 'group_add', channel: 'loyalty' },
  { key: 'abandoned_cart', label: 'Cart reminders', icon: 'shopping_cart_checkout', channel: 'retention' },
];

export function getOrderTrackingState(order: Record<string, any> = {}) {
  const status = String(order.status || 'pending').toLowerCase();
  const deliveryStatus = String(order.deliveryStatus || 'none').toLowerCase();
  const isDelivery = order.type === 'delivery';

  let activeKey = 'received';
  if (['confirmed', 'accepted'].includes(status)) activeKey = 'accepted';
  if (['preparing', 'cooking'].includes(status)) activeKey = 'cooking';
  if (['ready', 'plated'].includes(status)) activeKey = 'ready';
  if (isDelivery && ['assigned', 'out_for_delivery', 'dispatched'].includes(deliveryStatus)) activeKey = 'delivery';
  if (['completed', 'served'].includes(status) || ['delivered'].includes(deliveryStatus)) activeKey = 'completed';
  if (['cancelled', 'failed'].includes(status) || ['failed'].includes(deliveryStatus)) activeKey = 'received';

  const activeIndex = TRACKING_STEPS.findIndex(step => step.key === activeKey);
  const normalizedIndex = Math.max(0, activeIndex);
  const etaMinutes = activeKey === 'completed' ? 0 : isDelivery ? Math.max(10, 40 - normalizedIndex * 6) : Math.max(5, 24 - normalizedIndex * 4);

  return {
    activeKey,
    activeIndex: normalizedIndex,
    progress: Math.round(((normalizedIndex + 1) / TRACKING_STEPS.length) * 100),
    label: TRACKING_STEPS[normalizedIndex]?.label || 'Received',
    icon: TRACKING_STEPS[normalizedIndex]?.icon || 'receipt_long',
    etaMinutes,
    canReview: activeKey === 'completed',
    isTerminal: ['completed', 'cancelled', 'failed'].includes(activeKey) || ['completed', 'served', 'cancelled', 'failed'].includes(status),
  };
}

export function buildCustomerFavoritesFromOrders(orders = []) {
  const frequency = new Map<string, { itemId: any; itemName: string; count: number; source: string }>();
  for (const order of orders) {
    for (const item of parseOrderItems(order.items)) {
      const itemId = item.itemId || item.id || item.menuItemId || item.name || item.itemName;
      const itemName = item.itemName || item.name || 'Menu item';
      const key = String(itemId || itemName);
      const current = frequency.get(key) || { itemId, itemName, count: 0, source: 'orders' };
      current.count += Number(item.quantity || 1);
      frequency.set(key, current);
    }
  }
  return [...frequency.values()].sort((a, b) => b.count - a.count);
}

/**
 * Re-read one order's status on behalf of the guest who placed it.
 *
 * This used to query `orders` through PostgREST. A guest has no session, and `anon` deliberately
 * holds no select on that table — a grant there would hand every customer's name, phone and
 * address to anyone holding the publishable key. So every poll came back 42501, the `!error`
 * guard swallowed it, and the tracking screen showed the status the order had when it was placed,
 * for as long as the customer kept it open. Ten seconds apart, indefinitely.
 *
 * The `public-order` function answers instead, under the service role, returning only the tracking
 * fields for the single order whose client_order_id is presented. That id is a v4 UUID this
 * device minted and only it holds: the capability is the identifier, so no listing is possible.
 */
export async function fetchLiveOrder(order) {
  if (!order?.clientOrderId) return order;
  if (navigator.onLine) {
    try {
      const supabase = await getSupabaseClient({ persistSession: true });
      if (supabase) {
        const { data, error } = await supabase.functions.invoke('public-order', {
          body: { action: 'status', clientOrderId: order.clientOrderId }
        });
        if (!error && data?.order) {
          const { mapOrderToLocal } = await import('./sync');
          // The status payload is deliberately partial; keep the fields the tracking screen
          // already had rather than blanking them with undefined.
          const mapped = { ...order, ...mapOrderToLocal({ ...data.order, client_order_id: order.clientOrderId }) };
          const existing = await db.orders.where('clientOrderId').equals(order.clientOrderId).first();
          if (existing?.id) mapped.id = existing.id;
          await db.orders.put(mapped);
          return mapped;
        }
        if (error) {
          console.warn('[CustomerPlatform] Live order status lookup failed:', error?.message || error);
        }
      }
    } catch (error) {
      console.warn('[CustomerPlatform] Live order refresh fell back to local cache:', error);
    }
  }
  return getOrder(order.clientOrderId) || order;
}

export async function fetchCustomerOffers(customer = null) {
  if (!navigator.onLine) return FALLBACK_OFFERS;
  try {
    const supabase = await getSupabaseClient({ persistSession: true });
    if (!supabase) return FALLBACK_OFFERS;
    const storeId = localStorage.getItem('store_id') || 'the-taste';
    let query = supabase
      .from('customer_offers')
      .select('*')
      .eq('store_id', storeId)
      .eq('is_active', true)
      .order('sort_order');
    const { data, error } = await query;
    if (error || !data?.length) return FALLBACK_OFFERS;
    return data.map(row => ({
      id: row.id,
      code: row.code,
      title: row.title,
      label: row.label || 'Offer',
      description: row.description || '',
      displayValue: row.display_value || 'Server validates at checkout',
      icon: row.icon || 'local_offer',
      source: 'server',
      customerSegment: row.customer_segment || 'all',
      requiresAuth: Boolean(row.requires_auth),
      eligible: !row.requires_auth || Boolean(customer),
    }));
  } catch (error) {
    console.warn('[CustomerPlatform] Offer fetch failed:', error);
    return FALLBACK_OFFERS;
  }
}

export async function syncCustomerFavorite({ customer, item }) {
  if (!customer || !item) return { synced: false, reason: 'missing_customer_or_item' };
  const localKey = `customer_favorites_${customer.cloudUserId || customer.authUserId || customer.phone || 'guest'}`;
  const localFavorites = JSON.parse(localStorage.getItem(localKey) || '[]').filter(Boolean);
  const next = [...new Set([...localFavorites, String(item.id)])];
  localStorage.setItem(localKey, JSON.stringify(next));

  if (!navigator.onLine || !(customer.cloudUserId || customer.authUserId)) {
    return { synced: false, reason: 'local_only' };
  }

  try {
    const supabase = await getSupabaseClient({ persistSession: true });
    if (!supabase) return { synced: false, reason: 'no_client' };
    const { error } = await supabase.from('customer_favorites').upsert({
      user_id: customer.cloudUserId || customer.authUserId,
      store_id: localStorage.getItem('store_id') || 'the-taste',
      menu_item_id: item.id,
      item_name: item.name,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,store_id,menu_item_id' });
    return { synced: !error, error };
  } catch (error) {
    return { synced: false, error };
  }
}

export async function saveCustomerReview({ order, rating, comment = '', customer = null }) {
  if (!order?.clientOrderId) return { saved: false, reason: 'missing_order' };
  const payload = {
    rating: Math.max(1, Math.min(5, Number(rating) || 5)),
    comment: String(comment || '').trim().slice(0, 500),
    reviewedAt: new Date().toISOString(),
  };
  await updateOrderFields(order.id, { customerRating: payload.rating, customerReview: payload.comment, customerReviewedAt: payload.reviewedAt });

  const userId = customer?.cloudUserId || customer?.authUserId || null;
  if (!navigator.onLine || !userId) return { saved: true, synced: false };
  try {
    const supabase = await getSupabaseClient({ persistSession: true });
    if (!supabase) return { saved: true, synced: false };
    const { error } = await supabase.from('customer_reviews').upsert({
      store_id: localStorage.getItem('store_id') || 'the-taste',
      user_id: userId,
      order_client_id: order.clientOrderId,
      order_id: order.serverOrderId || null,
      rating: payload.rating,
      comment: payload.comment,
      updated_at: payload.reviewedAt,
    }, { onConflict: 'store_id,order_client_id' });
    return { saved: true, synced: !error, error };
  } catch (error) {
    return { saved: true, synced: false, error };
  }
}

export function injectCustomerStructuredData(settings: Record<string, any> = {}) {
  if (typeof document === 'undefined') return;
  const id = 'customer-platform-structured-data';
  document.getElementById(id)?.remove();
  const script = document.createElement('script');
  script.id = id;
  script.type = 'application/ld+json';
  script.textContent = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Restaurant',
    name: settings.name || 'The Taste',
    servesCuisine: ['Chinese', 'Indo-Chinese', 'Fast Food'],
    address: settings.address || 'Sandalpur Road, Kumhrar, Patna',
    telephone: settings.phone || '',
    priceRange: '₹₹',
    acceptsReservations: false,
    potentialAction: {
      '@type': 'OrderAction',
      target: `${window.location.origin}/#/self-order`,
    },
  });
  document.head.appendChild(script);
}
