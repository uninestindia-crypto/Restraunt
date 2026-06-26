// @ts-nocheck
import { createClient } from '@supabase/supabase-js';
import { getSetting } from '../db/database';

let cachedClient = null;
let cachedConfigKey = '';

export async function getStoredSupabaseConfig() {
  const url = (await getSetting('supabaseUrl')) || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = (await getSetting('supabaseKey')) || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  return { url: String(url).trim(), key: String(key).trim() };
}

export async function getSupabaseClient({ persistSession = true } = {}) {
  const { url, key } = await getStoredSupabaseConfig();
  if (!url || !key) return null;

  try {
    new URL(url);
  } catch (error) {
    console.error('[Supabase] Invalid project URL:', error);
    return null;
  }

  const configKey = `${url}|${key}|${persistSession}`;
  if (cachedClient && cachedConfigKey === configKey) return cachedClient;

  cachedClient = createClient(url, key, {
    auth: {
      persistSession,
      autoRefreshToken: persistSession
    }
  });
  cachedConfigKey = configKey;
  return cachedClient;
}

export function resetSupabaseClient() {
  cachedClient = null;
  cachedConfigKey = '';
}

export async function signInCloudStaff(email, password) {
  if (!email || !password) {
    return { success: false, message: 'Cloud email and password are required.' };
  }

  const client = await getSupabaseClient({ persistSession: true });
  if (!client) {
    return { success: false, message: 'Supabase URL and anon key are not configured.' };
  }

  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) return { success: false, message: error.message };
  return { success: true, user: data?.user || null };
}

export async function signOutCloudStaff() {
  const client = await getSupabaseClient({ persistSession: true });
  if (!client) return { success: true };
  const { error } = await client.auth.signOut();
  if (error) return { success: false, message: error.message };
  return { success: true };
}

export async function getCloudSession() {
  const client = await getSupabaseClient({ persistSession: true });
  if (!client) return null;
  const { data } = await client.auth.getSession();
  return data?.session || null;
}

export async function testSupabaseMenuRead(url, key) {
  if (!url || !key) return { success: false, message: 'URL and anon key are required.' };
  try {
    new URL(url);
    const client = createClient(url, key, { auth: { persistSession: false } });
    const { error } = await client.from('menu_categories').select('id').limit(1);
    if (error) throw error;
    return { success: true, message: 'Public menu read succeeded.' };
  } catch (error) {
    return { success: false, message: error.message || String(error) };
  }
}

export async function signUpCustomer(email, password) {
  if (!email || !password) {
    return { success: false, message: 'Email and password are required for sign up.' };
  }
  const client = await getSupabaseClient({ persistSession: true });
  if (!client) {
    return { success: false, message: 'Supabase is not configured.' };
  }
  const { data, error } = await client.auth.signUp({ email, password });
  if (error) return { success: false, message: error.message };
  return { success: true, user: data?.user || null };
}
