import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { pathToFileURL } from 'url';

export const DEFAULT_STORE_ID = 'the-taste';
export const VALID_ROLES = ['developer', 'owner', 'manager', 'cashier', 'kitchen', 'waiter', 'delivery'];
// Only these privileged roles can be provisioned via this script (developer assigns owners)
export const PROVISIONABLE_ROLES = ['developer', 'owner'];

export const DEFAULT_CATEGORIES = [
  { name: 'Momos', icon: '', sort_order: 1 },
  { name: 'Starters', icon: '', sort_order: 2 },
  { name: 'Noodles', icon: '', sort_order: 3 },
  { name: 'Rice', icon: '', sort_order: 4 },
  { name: 'Main Course', icon: '', sort_order: 5 },
  { name: 'Burgers', icon: '', sort_order: 6 },
  { name: 'Sides', icon: '', sort_order: 7 },
  { name: 'Beverages', icon: '', sort_order: 8 },
  { name: 'Desserts', icon: '', sort_order: 9 }
];

export const DEFAULT_MENU_ITEMS = [
  ['Momos', 'Steamed Veg Momos', 80, true],
  ['Momos', 'Fried Veg Momos', 100, true],
  ['Momos', 'Steamed Chicken Momos', 120, false],
  ['Momos', 'Fried Chicken Momos', 140, false],
  ['Momos', 'Paneer Momos', 120, true],
  ['Momos', 'Tandoori Momos (Chicken)', 150, false],
  ['Momos', 'Afghani Momos', 160, false],
  ['Momos', 'Kurkure Momos', 130, true],
  ['Starters', 'Veg Spring Rolls (4pc)', 120, true],
  ['Starters', 'Chilli Paneer Dry', 160, true],
  ['Starters', 'Honey Chilli Potato', 140, true],
  ['Starters', 'Crispy Corn', 120, true],
  ['Starters', 'Manchurian Dry', 140, true],
  ['Starters', 'Chicken 65', 180, false],
  ['Starters', 'Chilli Chicken Dry', 180, false],
  ['Starters', 'Dragon Chicken', 200, false],
  ['Noodles', 'Veg Hakka Noodles', 120, true],
  ['Noodles', 'Chicken Hakka Noodles', 160, false],
  ['Noodles', 'Veg Schezwan Noodles', 140, true],
  ['Noodles', 'Chow Mein', 100, true],
  ['Noodles', 'Singapore Noodles', 150, true],
  ['Noodles', 'Triple Schezwan Noodles', 180, true],
  ['Rice', 'Veg Fried Rice', 120, true],
  ['Rice', 'Chicken Fried Rice', 160, false],
  ['Rice', 'Schezwan Fried Rice', 140, true],
  ['Rice', 'Triple Schezwan Rice', 170, true],
  ['Rice', 'Egg Fried Rice', 130, false],
  ['Main Course', 'Manchurian Gravy', 160, true],
  ['Main Course', 'Chilli Paneer Gravy', 180, true],
  ['Main Course', 'Sweet Corn Soup', 100, true],
  ['Main Course', 'Hot & Sour Soup', 100, true],
  ['Main Course', 'Manchow Soup', 120, true],
  ['Main Course', 'Chicken Manchow Soup', 140, false],
  ['Burgers', 'Classic Veg Burger', 80, true],
  ['Burgers', 'Aloo Tikki Burger', 90, true],
  ['Burgers', 'Paneer Burger', 110, true],
  ['Burgers', 'Chicken Burger', 120, false],
  ['Burgers', 'Chicken Zinger', 150, false],
  ['Burgers', 'Paneer Wrap', 100, true],
  ['Burgers', 'Chicken Wrap', 130, false],
  ['Sides', 'French Fries', 80, true],
  ['Sides', 'Peri Peri Fries', 100, true],
  ['Sides', 'Loaded Cheese Fries', 140, true],
  ['Sides', 'Garlic Bread (4pc)', 100, true],
  ['Sides', 'Cheese Garlic Bread', 130, true],
  ['Beverages', 'Cold Coffee', 80, true],
  ['Beverages', 'Lemon Iced Tea', 60, true],
  ['Beverages', 'Mango Shake', 90, true],
  ['Beverages', 'Oreo Shake', 100, true],
  ['Beverages', 'Coca Cola (300ml)', 40, true],
  ['Beverages', 'Sprite (300ml)', 40, true],
  ['Beverages', 'Thumbs Up (300ml)', 40, true],
  ['Beverages', 'Water Bottle', 20, true],
  ['Beverages', 'Masala Chai', 20, true],
  ['Desserts', 'Brownie with Ice Cream', 120, true],
  ['Desserts', 'Gulab Jamun (2pc)', 60, true],
  ['Desserts', 'Chocolate Lava Cake', 150, true]
];

export function loadEnv() {
  const vars = { ...process.env };
  for (const filename of ['.env', '.env.deploy']) {
    const filePath = path.resolve(process.cwd(), filename);
    if (!fs.existsSync(filePath)) continue;

    for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*([^#=]+)\s*=\s*(.*)\s*$/);
      if (!match) continue;
      let value = match[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      vars[match[1].trim()] = value;
    }
  }
  return vars;
}

export function hashPin(pin) {
  return crypto.createHash('sha256').update(String(pin || '').trim()).digest('hex');
}

export function isWeakPin(pin) {
  const value = String(pin || '');
  return value === '1234' || /^(.)\1{3}$/.test(value) || '0123456789'.includes(value) || '9876543210'.includes(value);
}

function createServiceClient(url, serviceRoleKey) {
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

function ask(question, { secret = false } = {}) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  if (secret) {
    rl.stdoutMuted = true;
    rl._writeToOutput = function writeToOutput(stringToWrite) {
      if (rl.stdoutMuted && !stringToWrite.includes('\n')) {
        rl.output.write('*');
      } else {
        rl.output.write(stringToWrite);
      }
    };
  }
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      if (secret) process.stdout.write('\n');
      resolve(answer.trim());
    });
  });
}

async function valueOrPrompt(env, key, prompt, options = {}) {
  if (env[key]) return env[key].trim();
  return ask(prompt, options);
}

async function requireRuntimeConfig(env, mode) {
  const supabaseUrl = (env.VITE_SUPABASE_URL || env.SUPABASE_URL || '').trim();
  const serviceRoleKey = await valueOrPrompt(
    env,
    'SUPABASE_SERVICE_ROLE_KEY',
    'Paste SUPABASE_SERVICE_ROLE_KEY: ',
    { secret: true }
  );

  if (!supabaseUrl) throw new Error('VITE_SUPABASE_URL or SUPABASE_URL is required.');
  if (!serviceRoleKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required.');

  return {
    supabaseUrl,
    anonKey: (env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || '').trim(),
    serviceRoleKey,
    storeId: (env.STORE_ID || DEFAULT_STORE_ID).trim(),
    mode
  };
}

async function findUserByEmail(adminClient, email) {
  let page = 1;
  const perPage = 1000;
  while (true) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const found = data?.users?.find(user => user.email?.toLowerCase() === email.toLowerCase());
    if (found) return found;
    if (!data?.users || data.users.length < perPage) return null;
    page += 1;
  }
}

async function getNextBigIntId(client, tableName) {
  const { data, error } = await client
    .from(tableName)
    .select('id')
    .order('id', { ascending: false })
    .limit(1);
  if (error) throw error;
  return data?.length ? Number(data[0].id) + 1 : 1;
}

export async function repairAdmin({ client, config, admin }) {
  const email = admin.email;
  const password = admin.password;
  const pin = admin.pin;
  const role = admin.role || 'owner';
  const name = admin.name || email.split('@')[0] || (role === 'developer' ? 'Developer' : 'Owner');

  if (!PROVISIONABLE_ROLES.includes(role)) throw new Error(`Role "${role}" cannot be provisioned via this script. Use: ${PROVISIONABLE_ROLES.join(', ')}`);
  if (!email || !password || !pin) throw new Error('ADMIN_EMAIL, ADMIN_PASSWORD, and ADMIN_PIN are required.');
  if (!/^\d{4}$/.test(pin)) throw new Error('ADMIN_PIN must be exactly 4 digits.');
  if (isWeakPin(pin)) throw new Error('ADMIN_PIN is too weak. Choose a private non-sequential PIN.');

  let user = await findUserByEmail(client, email);
  if (user) {
    const { data, error } = await client.auth.admin.updateUserById(user.id, {
      email_confirm: true,
      password,
      user_metadata: { ...(user.user_metadata || {}), name },
      app_metadata: { ...(user.app_metadata || {}), role, store_id: config.storeId, is_active: true }
    });
    if (error) throw error;
    user = data.user;
  } else {
    const { data, error } = await client.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name },
      app_metadata: { role, store_id: config.storeId, is_active: true }
    });
    if (error) throw error;
    user = data.user;
  }

  const pinHash = hashPin(pin);
  const { data: existingStaff, error: existingStaffError } = await client
    .from('staff')
    .select('id')
    .eq('store_id', config.storeId)
    .eq('auth_user_id', user.id)
    .maybeSingle();
  if (existingStaffError) throw existingStaffError;

  const staffId = existingStaff?.id || await getNextBigIntId(client, 'staff');
  const now = new Date().toISOString();
  const staffRow = {
    id: staffId,
    store_id: config.storeId,
    auth_user_id: user.id,
    name,
    role,
    pin_hash: pinHash,
    allow_express: true,
    is_active: true,
    updated_at: now
  };
  if (!existingStaff) staffRow.created_at = now;

  const { error: staffError } = await client.from('staff').upsert(staffRow);
  if (staffError) throw staffError;

  const { error: membershipError } = await client
    .from('staff_memberships')
    .upsert({
      store_id: config.storeId,
      staff_id: staffId,
      auth_user_id: user.id,
      role,
      is_active: true,
      updated_at: now
    }, { onConflict: 'store_id,auth_user_id' });
  if (membershipError) throw membershipError;

  const { error: metadataError } = await client.auth.admin.updateUserById(user.id, {
    app_metadata: { ...(user.app_metadata || {}), role, store_id: config.storeId, staff_id: staffId, is_active: true }
  });
  if (metadataError) throw metadataError;

  return { authUserId: user.id, staffId, email, role };
}

async function ensureDefaultCategories(client, storeId) {
  const { data: existing, error } = await client
    .from('menu_categories')
    .select('id, name')
    .eq('store_id', storeId);
  if (error) throw error;

  const byName = new Map((existing || []).map(row => [row.name, row.id]));
  let nextId = existing?.length ? Math.max(...existing.map(row => Number(row.id))) + 1 : 1;
  const missing = [];

  for (const category of DEFAULT_CATEGORIES) {
    if (byName.has(category.name)) continue;
    const id = nextId++;
    byName.set(category.name, id);
    missing.push({
      id,
      store_id: storeId,
      name: category.name,
      icon: category.icon,
      sort_order: category.sort_order,
      is_active: true,
      updated_at: new Date().toISOString()
    });
  }

  if (missing.length) {
    const { error: insertError } = await client.from('menu_categories').upsert(missing);
    if (insertError) throw insertError;
  }

  return byName;
}

export function buildDefaultMenuRows(categoryIds, storeId) {
  return DEFAULT_MENU_ITEMS.map(([categoryName, name, price, isVeg], index) => ({
    id: index + 1,
    store_id: storeId,
    category_id: categoryIds.get(categoryName),
    name,
    price,
    is_available: true,
    is_veg: isVeg,
    sort_order: index + 1,
    updated_at: new Date().toISOString()
  })).filter(row => row.category_id);
}

export async function seedCloudMenu({ client, config }) {
  const { count, error: countError } = await client
    .from('menu_items')
    .select('id', { count: 'exact', head: true })
    .eq('store_id', config.storeId);
  if (countError) throw countError;

  if ((count || 0) > 0) {
    return { inserted: 0, skipped: true, existingItems: count };
  }

  const categoryIds = await ensureDefaultCategories(client, config.storeId);
  const rows = buildDefaultMenuRows(categoryIds, config.storeId);
  const { error } = await client.from('menu_items').upsert(rows);
  if (error) throw error;
  return { inserted: rows.length, skipped: false, existingItems: 0 };
}

export async function verifyCloud({ serviceClient, config, admin }) {
  const checks = {};
  const countTable = async table => {
    const { count, error } = await serviceClient
      .from(table)
      .select('id', { count: 'exact', head: true })
      .eq('store_id', config.storeId);
    if (error) throw error;
    return count || 0;
  };

  checks.menuCategories = await countTable('menu_categories');
  checks.menuItems = await countTable('menu_items');

  if (admin?.email) {
    const user = await findUserByEmail(serviceClient, admin.email);
    checks.adminAuthUser = Boolean(user);
    if (user) {
      const { data: membership, error } = await serviceClient
        .from('staff_memberships')
        .select('id, role, is_active, staff_id')
        .eq('store_id', config.storeId)
        .eq('auth_user_id', user.id)
        .maybeSingle();
      if (error) throw error;
      checks.activeOwnerMembership = Boolean(membership?.is_active && membership.role === 'owner');
    }
  }

  if (admin?.email && admin?.password && config.anonKey) {
    const userClient = createClient(config.supabaseUrl, config.anonKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
    const { error: signInError } = await userClient.auth.signInWithPassword({
      email: admin.email,
      password: admin.password
    });
    if (signInError) {
      checks.ownerRlsRead = false;
      checks.ownerRlsError = signInError.message;
    } else {
      const { error: staffReadError } = await userClient.from('staff').select('id').limit(1);
      const { error: orderReadError } = await userClient.from('orders').select('id').limit(1);
      checks.ownerRlsRead = !staffReadError && !orderReadError;
      checks.ownerRlsError = staffReadError?.message || orderReadError?.message || null;
      await userClient.auth.signOut();
    }
  }

  checks.ok = checks.menuItems > 0 && (checks.activeOwnerMembership !== false) && (checks.ownerRlsRead !== false);
  return checks;
}

async function collectAdminInput(env, { requirePassword = false } = {}) {
  const email = await valueOrPrompt(env, 'ADMIN_EMAIL', 'Admin email: ');
  const name = env.ADMIN_NAME || (email ? email.split('@')[0] : 'Owner');
  const password = requirePassword
    ? await valueOrPrompt(env, 'ADMIN_PASSWORD', 'Admin cloud password: ', { secret: true })
    : (env.ADMIN_PASSWORD || '');
  const pin = env.ADMIN_PIN || (requirePassword ? await ask('Admin local PIN: ', { secret: true }) : '');
  return { email, password, pin, name };
}

async function main() {
  const mode = process.argv[2] || 'verify-cloud';
  if (!['repair-admin', 'seed-cloud-menu', 'verify-cloud', 'all'].includes(mode)) {
    throw new Error('Mode must be one of: repair-admin, seed-cloud-menu, verify-cloud, all');
  }

  const env = loadEnv();
  const config = await requireRuntimeConfig(env, mode);
  const client = createServiceClient(config.supabaseUrl, config.serviceRoleKey);
  let admin = null;

  if (mode === 'repair-admin' || mode === 'all') {
    admin = await collectAdminInput(env, { requirePassword: true });

    // Parse --role flag from CLI args (e.g. node provision-admin.js repair-admin --role developer)
    const roleArgIdx = process.argv.indexOf('--role');
    if (roleArgIdx !== -1 && process.argv[roleArgIdx + 1]) {
      admin.role = process.argv[roleArgIdx + 1].trim().toLowerCase();
    }

    const result = await repairAdmin({ client, config, admin });
    console.log(`${result.role.toUpperCase()} provisioned:`, { email: result.email, role: result.role, staffId: result.staffId, authUserId: result.authUserId });
  }

  if (mode === 'seed-cloud-menu' || mode === 'all') {
    const result = await seedCloudMenu({ client, config });
    console.log('Menu seed:', result);
  }

  if (mode === 'verify-cloud' || mode === 'all') {
    admin = admin || await collectAdminInput(env, { requirePassword: Boolean(env.ADMIN_EMAIL || env.ADMIN_PASSWORD) });
    const result = await verifyCloud({ serviceClient: client, config, admin });
    console.log('Cloud verification:', result);
    if (!result.ok) process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch(error => {
    console.error('Recovery failed:', error.message || error);
    process.exit(1);
  });
}
