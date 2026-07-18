import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { pathToFileURL } from 'url';

export const DEFAULT_STORE_ID = 'the-taste';
export const VALID_ROLES = ['developer', 'owner', 'manager', 'cashier', 'kitchen', 'waiter', 'delivery'];
// Only these privileged roles can be provisioned via this script (developer assigns owners)
export const PROVISIONABLE_ROLES = ['developer', 'owner'];

export const DEFAULT_CATEGORIES = [
  { name: 'Fries', icon: '🍟', sort_order: 1 },
  { name: 'Roll / Wrap', icon: '🌯', sort_order: 2 },
  { name: 'Fried Rice', icon: '🍚', sort_order: 3 },
  { name: 'Noodles', icon: '🍜', sort_order: 4 },
  { name: 'Biryani', icon: '🍲', sort_order: 5 },
  { name: 'Soup', icon: '🥣', sort_order: 6 },
  { name: 'Veg Chinese', icon: '🥦', sort_order: 7 },
  { name: 'Non-Veg Chinese', icon: '🍗', sort_order: 8 },
  { name: 'Veg Burger', icon: '🍔', sort_order: 9 },
  { name: 'Egg Burger', icon: '🥚', sort_order: 10 },
  { name: 'Chicken Burger', icon: '🍔', sort_order: 11 }
];

export const DEFAULT_MENU_ITEMS = [
  // Fries
  ['Fries', 'French Fries', 80, true],
  ['Fries', 'Masala Fries', 90, true],
  ['Fries', 'Chicken Crispy', 120, false],
  // Roll / Wrap
  ['Roll / Wrap', 'Veg Roll', 65, true],
  ['Roll / Wrap', 'Egg Roll', 70, false],
  ['Roll / Wrap', 'Double Egg Roll', 80, false],
  ['Roll / Wrap', 'Paneer Roll', 100, true],
  ['Roll / Wrap', 'Paneer Cheese Roll', 110, true],
  ['Roll / Wrap', 'Paneer Schezwan Roll', 110, true],
  ['Roll / Wrap', 'Chicken Roll', 100, false],
  ['Roll / Wrap', 'Chicken Cheese Roll', 110, false],
  ['Roll / Wrap', 'Combi Chicken Roll', 120, false],
  // Fried Rice
  ['Fried Rice', 'Veg Fried Rice (Half)', 80, true],
  ['Fried Rice', 'Veg Fried Rice (Full)', 130, true],
  ['Fried Rice', 'Veg Schezwan Fried Rice (Half)', 90, true],
  ['Fried Rice', 'Veg Schezwan Fried Rice (Full)', 150, true],
  ['Fried Rice', 'Paneer Fried Rice (Half)', 100, true],
  ['Fried Rice', 'Paneer Fried Rice (Full)', 170, true],
  ['Fried Rice', 'Paneer Schezwan Fried Rice (Half)', 110, true],
  ['Fried Rice', 'Paneer Schezwan Fried Rice (Full)', 190, true],
  ['Fried Rice', 'Egg Fried Rice (Half)', 90, false],
  ['Fried Rice', 'Egg Fried Rice (Full)', 150, false],
  ['Fried Rice', 'Egg Schezwan Fried Rice (Half)', 100, false],
  ['Fried Rice', 'Egg Schezwan Fried Rice (Full)', 170, false],
  ['Fried Rice', 'Chicken Fried Rice (Half)', 100, false],
  ['Fried Rice', 'Chicken Fried Rice (Full)', 170, false],
  ['Fried Rice', 'Chicken Schezwan Fried Rice (Half)', 100, false],
  ['Fried Rice', 'Chicken Schezwan Fried Rice (Full)', 190, false],
  // Noodles
  ['Noodles', 'Veg Noodles (Half)', 80, true],
  ['Noodles', 'Veg Noodles (Full)', 130, true],
  ['Noodles', 'Veg Schezwan Noodles (Half)', 90, true],
  ['Noodles', 'Veg Schezwan Noodles (Full)', 150, true],
  ['Noodles', 'Paneer Noodles (Half)', 100, true],
  ['Noodles', 'Paneer Noodles (Full)', 170, true],
  ['Noodles', 'Paneer Schezwan Noodles (Half)', 110, true],
  ['Noodles', 'Paneer Schezwan Noodles (Full)', 190, true],
  ['Noodles', 'Egg Noodles (Half)', 90, false],
  ['Noodles', 'Egg Noodles (Full)', 150, false],
  ['Noodles', 'Egg Schezwan Noodles (Half)', 100, false],
  ['Noodles', 'Egg Schezwan Noodles (Full)', 170, false],
  ['Noodles', 'Chicken Noodles (Half)', 100, false],
  ['Noodles', 'Chicken Noodles (Full)', 170, false],
  ['Noodles', 'Chicken Schezwan Noodles (Half)', 110, false],
  ['Noodles', 'Chicken Schezwan Noodles (Full)', 190, false],
  // Biryani
  ['Biryani', 'Biryani (Half)', 100, false],
  ['Biryani', 'Biryani (Full)', 160, false],
  // Soup
  ['Soup', 'Veg Hot And Sour Soup (Half)', 60, true],
  ['Soup', 'Veg Hot And Sour Soup (Full)', 90, true],
  ['Soup', 'Veg Manchow Soup (Half)', 70, true],
  ['Soup', 'Veg Manchow Soup (Full)', 110, true],
  ['Soup', 'Chicken Clear Soup (Half)', 70, false],
  ['Soup', 'Chicken Clear Soup (Full)', 110, false],
  ['Soup', 'Chicken Hot And Sour Soup (Half)', 70, false],
  ['Soup', 'Chicken Hot And Sour Soup (Full)', 110, false],
  ['Soup', 'Chicken Manchow Soup (Half)', 80, false],
  ['Soup', 'Chicken Manchow Soup (Full)', 120, false],
  ['Soup', 'Chicken Noodle Soup (Half)', 70, false],
  ['Soup', 'Chicken Noodle Soup (Full)', 120, false],
  // Veg Chinese
  ['Veg Chinese', 'Veg Manchurian', 149, true],
  ['Veg Chinese', 'Veg 65', 159, true],
  ['Veg Chinese', 'Paneer Chilli', 200, true],
  ['Veg Chinese', 'Paneer Manchurian', 175, true],
  ['Veg Chinese', 'Mushroom Chilli', 250, true],
  ['Veg Chinese', 'Baby Corn Chilli', 240, true],
  // Non-Veg Chinese
  ['Non-Veg Chinese', 'Chicken Manchurian', 179, false],
  ['Non-Veg Chinese', 'Chicken Shezwan', 189, false],
  ['Non-Veg Chinese', 'Bone Chilli', 200, false],
  ['Non-Veg Chinese', 'Chicken Lollipop', 300, false],
  ['Non-Veg Chinese', 'Chicken Chilli', 220, false],
  ['Non-Veg Chinese', 'Chicken 65', 240, false],
  ['Non-Veg Chinese', 'Chicken Boneless', 170, false],
  // Veg Burger
  ['Veg Burger', 'Veg Burger', 70, true],
  ['Veg Burger', 'Veg Cheese Burger', 90, true],
  ['Veg Burger', 'Veg Double Cheese Burger', 110, true],
  // Egg Burger
  ['Egg Burger', 'Egg Burger', 50, false],
  ['Egg Burger', 'Egg Cheese Burger', 70, false],
  ['Egg Burger', 'Egg Double Cheese Burger', 90, false],
  // Chicken Burger
  ['Chicken Burger', 'Chicken Burger', 80, false],
  ['Chicken Burger', 'Chicken Cheese Burger', 100, false],
  ['Chicken Burger', 'Chicken Double Cheese Burger', 120, false]
];

export function loadEnv() {
  const vars = { ...process.env };
  for (const filename of ['.env', '.env.admin.local', '.env.deploy']) {
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
  const supabaseUrl = (env.NEXT_PUBLIC_SUPABASE_URL || env.VITE_SUPABASE_URL || env.SUPABASE_URL || '').trim();
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
    anonKey: (
      env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
      || env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      || env.VITE_SUPABASE_ANON_KEY
      || env.SUPABASE_ANON_KEY
      || ''
    ).trim(),
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
  const role = admin.role || 'owner';
  const name = admin.name || email.split('@')[0] || (role === 'developer' ? 'Developer' : 'Owner');

  if (!PROVISIONABLE_ROLES.includes(role)) throw new Error(`Role "${role}" cannot be provisioned via this script. Use: ${PROVISIONABLE_ROLES.join(', ')}`);
  if (!email || !password) throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD are required.');

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
  return { email, password, name };
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
