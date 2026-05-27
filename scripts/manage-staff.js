/**
 * ═══════════════════════════════════════════════════
 *  NextGenOS Restaurant Operating System
 *  Module: Live Staff Provisioning Utility
 *  Version: 2.0.0
 *  © 2026 NextGenOS. All Rights Reserved.
 * ═══════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import readline from 'readline';
import fs from 'fs';
import path from 'path';

// Helper to hash a PIN matching the client-side SHA-256 hash
function hashPin(pin) {
  return crypto.createHash('sha256').update(pin.trim()).digest('hex');
}

// Read environment variables
function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env');
  const deployEnvPath = path.resolve(process.cwd(), '.env.deploy');
  const vars = {};

  const parseFile = (filePath) => {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      content.split('\n').forEach(line => {
        const match = line.match(/^\s*([^#=]+)\s*=\s*(.*)\s*$/);
        if (match) {
          const key = match[1].trim();
          let value = match[2].trim();
          if (value.startsWith('"') && value.endsWith('"')) {
            value = value.substring(1, value.length - 1);
          } else if (value.startsWith("'") && value.endsWith("'")) {
            value = value.substring(1, value.length - 1);
          }
          vars[key] = value;
        }
      });
    }
  };

  parseFile(envPath);
  parseFile(deployEnvPath);
  return vars;
}

const envVars = loadEnv();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const askQuestion = (query) => new Promise((resolve) => rl.question(query, resolve));

async function main() {
  console.log('\n\x1b[35m═══════════════════════════════════════════════════\x1b[0m');
  console.log('\x1b[36m    NextGenOS Restaurant OS - Staff Provisioner    \x1b[0m');
  console.log('\x1b[35m═══════════════════════════════════════════════════\x1b[0m\n');

  let supabaseUrl = envVars.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  let serviceRoleKey = envVars.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  if (!supabaseUrl) {
    supabaseUrl = await askQuestion('\x1b[33mEnter production Supabase Project URL:\x1b[0m ');
  }
  if (!serviceRoleKey) {
    serviceRoleKey = await askQuestion('\x1b[33mEnter Project Service Role Key (service_role):\x1b[0m ');
  }

  supabaseUrl = supabaseUrl.trim();
  serviceRoleKey = serviceRoleKey.trim();

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('\x1b[31mError: Both Supabase URL and Service Role Key are required to manage staff.\x1b[0m');
    rl.close();
    return;
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  // Verify connection by fetching a row
  try {
    const { error } = await supabase.from('staff').select('id').limit(1);
    if (error) throw error;
    console.log('\x1b[32m✔ Connected to live database successfully!\x1b[0m\n');
  } catch (err) {
    console.error('\x1b[31mConnection failed. Please check your URL and service_role key.\x1b[0m');
    console.error('\x1b[31mDetails:\x1b[0m', err.message || err);
    rl.close();
    return;
  }

  console.log('Select Action:');
  console.log('  1) Provision New Staff User (Create Auth User + Staff Record + Membership)');
  console.log('  2) View Active Staff Memberships');
  console.log('  3) Exit');
  
  const choice = (await askQuestion('\n\x1b[36mChoice (1-3):\x1b[0m ')).trim();

  if (choice === '1') {
    await provisionStaff(supabase);
  } else if (choice === '2') {
    await listStaff(supabase);
  } else {
    console.log('Goodbye!');
  }

  rl.close();
}

async function listStaff(supabase) {
  console.log('\n\x1b[34mFetching staff records...\x1b[0m');
  const { data: staffList, error: staffError } = await supabase
    .from('staff')
    .select('id, name, role, is_active, auth_user_id');

  if (staffError) {
    console.error('\x1b[31mFailed to read staff table:\x1b[0m', staffError.message);
    return;
  }

  if (!staffList || staffList.length === 0) {
    console.log('No staff members registered yet.');
    return;
  }

  console.log('\n\x1b[36mRegistered Staff:\x1b[0m');
  console.table(staffList);
}

async function provisionStaff(supabase) {
  console.log('\n\x1b[36m--- Staff Information ---\x1b[0m');
  const name = (await askQuestion('Enter Staff Full Name: ')).trim();
  const email = (await askQuestion('Enter Staff Cloud Login Email: ')).trim();
  const password = (await askQuestion('Enter Staff Cloud Login Password (min 6 chars): ')).trim();
  const pin = (await askQuestion('Enter Local Staff PIN (4 digits): ')).trim();
  const role = (await askQuestion('Enter Role (owner, manager, cashier, kitchen, waiter, delivery): ')).trim().toLowerCase();

  // Validations
  if (!name || !email || !password || !pin || !role) {
    console.error('\x1b[31mError: All fields are required.\x1b[0m');
    return;
  }

  if (!/^\d{4}$/.test(pin)) {
    console.error('\x1b[31mError: Local PIN must be exactly 4 digits.\x1b[0m');
    return;
  }

  const validRoles = ['owner', 'manager', 'cashier', 'kitchen', 'waiter', 'delivery'];
  if (!validRoles.includes(role)) {
    console.error(`\x1b[31mError: Role must be one of: ${validRoles.join(', ')}.\x1b[0m`);
    return;
  }

  if (password.length < 6) {
    console.error('\x1b[31mError: Password must be at least 6 characters.\x1b[0m');
    return;
  }

  console.log('\n\x1b[34mCreating Supabase Auth user...\x1b[0m');
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true
  });

  if (authError) {
    console.error('\x1b[31mFailed to create auth user:\x1b[0m', authError.message);
    return;
  }

  const authUserId = authData.user.id;
  console.log(`\x1b[32m✔ Created Supabase Auth User with ID: ${authUserId}\x1b[0m`);

  const pinHash = hashPin(pin);
  const staffId = Date.now();

  console.log('\x1b[34mAdding staff record...\x1b[0m');
  const { data: staffData, error: staffError } = await supabase
    .from('staff')
    .insert({
      id: staffId,
      name,
      role,
      pin_hash: pinHash,
      is_active: true,
      auth_user_id: authUserId
    })
    .select()
    .single();

  if (staffError) {
    console.error('\x1b[31mFailed to add staff record (rolling back auth user):\x1b[0m', staffError.message);
    await supabase.auth.admin.deleteUser(authUserId);
    return;
  }
  console.log('\x1b[32m✔ Added staff record successfully!\x1b[0m');

  console.log('\x1b[34mAdding staff membership RLS record...\x1b[0m');
  const { error: membershipError } = await supabase
    .from('staff_memberships')
    .insert({
      store_id: 'the-taste',
      staff_id: staffId,
      auth_user_id: authUserId,
      role,
      is_active: true
    });

  if (membershipError) {
    console.error('\x1b[31mFailed to add staff membership (rolling back staff and auth):\x1b[0m', membershipError.message);
    await supabase.from('staff').delete().eq('id', staffId);
    await supabase.auth.admin.deleteUser(authUserId);
    return;
  }

  console.log('\n\x1b[32m✔ SUCCESS: Staff member has been fully provisioned!\x1b[0m');
  console.log(`  Staff ID:      ${staffId}`);
  console.log(`  Cloud Login:   ${email}`);
  console.log(`  Hashed PIN:    ${pinHash}`);
  console.log(`  Access Level:  ${role}`);
  console.log('\nThis user can now login to sync and manage the POS app immediately!');
}

main().catch(err => {
  console.error('\x1b[31mExecution failed:\x1b[0m', err);
  rl.close();
});
