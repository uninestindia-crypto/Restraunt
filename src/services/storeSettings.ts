/**
 * The settings that belong to the restaurant rather than to one browser.
 *
 * Everything on the Settings screen used to live only in that device's IndexedDB. Set the UPI ID
 * on the laptop and the phone still had none; set the receipt footer on till 1 and till 2 printed
 * without it; replace a device and the configuration went with it.
 *
 * The split below is the whole design. A key is store-scoped unless it describes *this machine* or
 * is a credential, because a restaurant has one name and one UPI ID but each till has its own
 * printer and each person their own theme.
 */
import { getSupabaseClient } from './supabaseClient';
import { getStoreId, markCloudDataStale } from './cloudDb';
import { db, setSetting } from '../db/database';

/**
 * Settings that stay on the device that set them, and why.
 *
 * Everything else on the Settings screen is store-scoped. Adding a key to the screen therefore
 * syncs it by default, which is the safer direction to be wrong in: a shared value appearing on a
 * second till is a surprise someone can undo, a private one leaking to every screen is not.
 */
export const DEVICE_LOCAL_SETTINGS = new Set([
  // Credentials and per-device cloud identity.
  'supabaseUrl', 'supabaseKey', 'supabaseEmail', 'googleClientId', 'autoUploadToDrive',
  // This machine's hardware.
  'printerWidth', 'printDensity', 'printCopies', 'autoPrintOnConfirm',
  // This person's preference.
  'app_theme',
  // Owned by store_security_settings, which prices orders server-side. Two homes for one number is
  // the bug that made the Settings screen show one tax rate while customers paid another.
  'gstPercent', 'deliveryFee',
]);

export const isStoreScoped = (key: string) => !DEVICE_LOCAL_SETTINGS.has(key);

export interface PublishSettingsResult {
  ok: boolean;
  error?: string;
  published?: number;
}

/**
 * Send the store-scoped settings up, and only then cache them locally.
 *
 * The order matters, exactly as it does for the rates: caching first leaves a device showing a
 * value the server refused. And the rows have to come back — an upsert the policy filtered out
 * returns 200 with nothing in it, so success and "changed nothing" are otherwise identical.
 */
export async function publishStoreSettings(entries: Record<string, any>): Promise<PublishSettingsResult> {
  const storeId = getStoreId();
  const rows = Object.entries(entries)
    .filter(([key]) => isStoreScoped(key))
    .map(([key, value]) => ({ store_id: storeId, key, value: String(value ?? '') }));

  if (!rows.length) return { ok: true, published: 0 };

  try {
    const client = await getSupabaseClient({ persistSession: true });
    if (!client) return { ok: false, error: 'No cloud connection.' };

    const { data, error } = await client
      .from('store_settings')
      .upsert(rows, { onConflict: 'store_id,key' })
      .select('key, value');

    if (error) return { ok: false, error: error.message };
    if (!data?.length) {
      return { ok: false, error: 'The server did not accept the change. Manager access is required.' };
    }

    for (const row of data) await setSetting(row.key, row.value);
    markCloudDataStale('storeSettings');
    return { ok: true, published: data.length };
  } catch (error: any) {
    return { ok: false, error: error?.message || String(error) };
  }
}

/**
 * Bring the store's settings down onto this device.
 *
 * Called by the cloud pull, so a till that has never been configured comes up holding the same
 * restaurant name, UPI ID and receipt wording as every other screen in the building.
 */
export async function hydrateStoreSettings(rows: Array<{ key: string; value: string }>) {
  const wanted = rows.filter((row) => row && typeof row.key === 'string' && isStoreScoped(row.key));
  if (!wanted.length) return 0;
  await db.settings.bulkPut(wanted.map((row) => ({ key: row.key, value: row.value ?? '' })));
  return wanted.length;
}
