/**
 * The store's published rates — the one place the tax percentage lives.
 *
 * `store_security_settings` holds one row per store and is what `public-order` prices every
 * customer order from. Before this, the rate had three homes that agreed only by coincidence:
 * a per-device IndexedDB setting this screen wrote, an environment variable the order function
 * charged from, and this table, which nothing read.
 */
import { getSupabaseClient } from './supabaseClient';
import { getStoreId, markCloudDataStale } from './cloudDb';
import { setSetting } from '../db/database';

export interface PublishRatesResult {
  ok: boolean;
  error?: string;
}

/**
 * Write the store's rates, and only then cache them locally.
 *
 * The order matters: caching first would leave a device showing a rate the server rejected, which
 * is the exact failure this whole change exists to remove.
 */
export async function publishStoreRates(
  { gstPercent, deliveryFee }: { gstPercent?: number; deliveryFee?: number }
): Promise<PublishRatesResult> {
  const patch: Record<string, number> = {};
  if (Number.isFinite(gstPercent as number)) patch.gst_percent = Number(gstPercent);
  if (Number.isFinite(deliveryFee as number)) patch.delivery_fee = Number(deliveryFee);
  if (!Object.keys(patch).length) return { ok: true };

  try {
    const client = await getSupabaseClient({ persistSession: true });
    if (!client) return { ok: false, error: 'No cloud connection.' };

    const { data, error } = await client
      .from('store_security_settings')
      .update(patch)
      .eq('store_id', getStoreId())
      .select('gst_percent, delivery_fee');

    if (error) return { ok: false, error: error.message };
    // An update the policy filtered out returns 200 with no rows — success and "changed nothing"
    // are indistinguishable without asking for the rows back.
    if (!data?.length) {
      return { ok: false, error: 'The server did not accept the change. Manager access is required.' };
    }

    if (patch.gst_percent !== undefined) await setSetting('gstPercent', String(data[0].gst_percent));
    if (patch.delivery_fee !== undefined) await setSetting('deliveryFee', String(data[0].delivery_fee));
    markCloudDataStale('storeRates');
    return { ok: true };
  } catch (error: any) {
    return { ok: false, error: error?.message || String(error) };
  }
}
