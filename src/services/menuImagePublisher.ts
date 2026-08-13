/**
 * ═══════════════════════════════════════════════════
 *  NextGenOS Restaurant Operating System
 *  Module: Menu Image Publisher
 *  Version: 1.0.0
 *  © 2026 NextGenOS. All Rights Reserved.
 * ═══════════════════════════════════════════════════
 *
 * Gets a dish photo off the device it was taken on and into the cloud.
 *
 * A photo picked in the menu manager is shown immediately from a local data URL
 * (`menuItems.imageData`) and then uploaded to Supabase Storage, which is what
 * puts a link in `menu_items.image_url` for every other device to read. Storage
 * writes are gated on an active cloud manager session, so the upload genuinely
 * can fail — an owner working on a PIN shift, a dropped connection, a bucket
 * that has not been provisioned.
 *
 * Before this module the failure was terminal: the picture stayed in
 * `imageData`, which is device-local by design and is never published (the
 * cloud column is a varchar(500) and cannot hold a data URL). The operator saw
 * their new photo, assumed the menu was updated, and a second laptop showed the
 * old dish forever.
 *
 * So an unpublished photo is now a *pending* photo. It is retried whenever the
 * app has a cloud session — on opening the menu manager, and on reconnect — and
 * the menu manager marks the item until it lands.
 */

import { db } from '../db/database';
import { getSupabaseClient } from './supabaseClient';

const BUCKET = 'menu-images';

/** Storage RLS only accepts writes under this prefix. */
const UPLOAD_PREFIX = 'items';

const EXT_BY_TYPE = {
  'image/png': 'png',
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg'
};

/** True when the item is showing a photo that only exists on this device. */
export function hasUnpublishedImage(item) {
  return Boolean(item && String(item.imageData || '') && !String(item.imageUrl || '').trim());
}

function dataUrlToBlob(dataUrl) {
  const match = /^data:([^;,]+)(;base64)?,(.*)$/i.exec(String(dataUrl || ''));
  if (!match) return null;

  const [, type, isBase64, payload] = match;
  try {
    if (isBase64) {
      const binary = atob(payload);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return new Blob([bytes], { type });
    }
    return new Blob([decodeURIComponent(payload)], { type });
  } catch (error) {
    console.error('[MenuImages] Could not decode a stored image:', error);
    return null;
  }
}

/**
 * Upload an image to the shared bucket and return its public link.
 *
 * @returns {Promise<{url: string, reason: string}>} `url` empty with a `reason`
 *   fit to show an operator when the cloud would not take it.
 */
export async function uploadMenuImage(blob, type) {
  if (!blob) return { url: '', reason: 'The image could not be read from this device.' };

  try {
    const supabase = await getSupabaseClient();
    if (!supabase) {
      return { url: '', reason: 'Cloud storage is not configured on this device.' };
    }

    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData?.session) {
      return { url: '', reason: 'Sign in with your cloud manager account to publish it to all devices.' };
    }

    const fileExt = EXT_BY_TYPE[type] || 'jpg';
    const filePath = `${UPLOAD_PREFIX}/${Date.now()}_${Math.random().toString(36).slice(2, 11)}.${fileExt}`;

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(filePath, blob, { cacheControl: '3600', upsert: true, contentType: type });
    if (error) throw error;

    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(filePath);
    const publicUrl = String(urlData?.publicUrl || '');
    if (!publicUrl) {
      return { url: '', reason: 'Cloud storage did not return a public link.' };
    }
    return { url: publicUrl, reason: '' };
  } catch (err) {
    const message = err?.message || String(err);
    console.error('[MenuImages] Cloud image upload failed:', err);
    const denied = /row-level security|not authoriz|unauthoriz|permission|policy|403/i.test(message);
    return {
      url: '',
      reason: denied
        ? 'Cloud upload was refused — a manager/owner cloud login is required.'
        : `Cloud upload failed: ${message}`
    };
  }
}

/** Items whose photo is still waiting to reach the cloud. */
export async function getUnpublishedImageItems() {
  try {
    return (await db.menuItems.toArray()).filter(hasUnpublishedImage);
  } catch (error) {
    console.error('[MenuImages] Could not read the local menu:', error);
    return [];
  }
}

/**
 * Publish every dish photo that is still device-local.
 *
 * Safe to call often and from several places: it does nothing when there is
 * nothing pending, when the device is offline, or when the cloud refuses the
 * write — in which case the photo simply stays pending for the next attempt.
 *
 * @returns {Promise<{published: number, pending: number, reason: string}>}
 */
export async function publishPendingMenuImages() {
  const pendingItems = await getUnpublishedImageItems();
  if (pendingItems.length === 0) return { published: 0, pending: 0, reason: '' };

  if (!navigator.onLine) {
    return { published: 0, pending: pendingItems.length, reason: 'Device is offline.' };
  }

  let published = 0;
  let reason = '';

  for (const item of pendingItems) {
    const blob = dataUrlToBlob(item.imageData);
    const type = blob?.type || 'image/jpeg';
    const { url, reason: failure } = await uploadMenuImage(blob, type);

    if (!url) {
      reason = failure;
      // A refusal applies to every pending photo (no session, no bucket), so
      // stop rather than retrying the same rejection for each one.
      break;
    }

    try {
      // Clearing imageData is what makes the cloud link the single source: the
      // local copy would otherwise keep winning on this device forever.
      await db.menuItems.update(item.id, { imageUrl: url, imageData: '', isSynced: 0 });
      const updated = await db.menuItems.get(item.id);
      const { syncService } = await import('./sync');
      await syncService.syncUpItem(updated);
      published += 1;
      console.log(`[MenuImages] Published the photo for "${item.name}".`);
    } catch (error) {
      console.error(`[MenuImages] Could not record the published photo for "${item.name}":`, error);
      reason = error?.message || String(error);
      break;
    }
  }

  const stillPending = (await getUnpublishedImageItems()).length;
  return { published, pending: stillPending, reason };
}

let retryBound = false;

/**
 * Retry pending photos whenever the app regains a connection.
 *
 * Registered once, from the menu manager, so a photo taken during an outage is
 * published without anyone having to remember to re-pick the file.
 */
export function startPendingImageRetry() {
  if (retryBound || typeof window === 'undefined') return;
  retryBound = true;
  window.addEventListener('online', () => {
    setTimeout(() => {
      publishPendingMenuImages().catch(err =>
        console.warn('[MenuImages] Retry after reconnect failed:', err));
    }, 3000);
  });
}
