/**
 * ═══════════════════════════════════════════════════
 *  NextGenOS — Quick Admin Provisioner
 *  Creates a Supabase Auth user + staff record + membership
 *  for the given email/password with owner role.
 * ═══════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// ── Config ──────────────────────────────────────────
const TARGET_EMAIL    = 'mohammadjalaluddin1010@gmail.com';
const TARGET_PASSWORD = '123456';
const TARGET_NAME     = 'Mohammad Jalaluddin';
const TARGET_ROLE     = 'owner';
const TARGET_PIN      = '5678';  // Local backup PIN (not 1234!)
const STORE_ID        = 'the-taste';

// ── Load .env ───────────────────────────────────────
function loadEnv() {
  const vars = {};
  const parseFile = (filePath) => {
    if (fs.existsSync(filePath)) {
      fs.readFileSync(filePath, 'utf-8').split('\n').forEach(line => {
        const match = line.match(/^\s*([^#=]+)\s*=\s*(.*)\s*$/);
        if (match) {
          let value = match[2].trim();
          if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
          }
          vars[match[1].trim()] = value;
        }
      });
    }
  };
  parseFile(path.resolve(process.cwd(), '.env'));
  parseFile(path.resolve(process.cwd(), '.env.deploy'));
  return vars;
}

function hashPin(pin) {
  return crypto.createHash('sha256').update(pin.trim()).digest('hex');
}

async function main() {
  console.log('\n\x1b[35m═══════════════════════════════════════════════════\x1b[0m');
  console.log('\x1b[36m    NextGenOS — Admin Provisioner                  \x1b[0m');
  console.log('\x1b[35m═══════════════════════════════════════════════════\x1b[0m\n');

  const env = loadEnv();
  const supabaseUrl = env.VITE_SUPABASE_URL || '';
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY || '';
  const anonKey = env.VITE_SUPABASE_ANON_KEY || '';

  if (!supabaseUrl) {
    console.error('\x1b[31mError: VITE_SUPABASE_URL not found in .env\x1b[0m');
    process.exit(1);
  }

  // Prefer service role key for confirmed user creation; fall back to anon key
  const useServiceRole = !!serviceRoleKey;
  const authKey = serviceRoleKey || anonKey;

  if (!authKey) {
    console.error('\x1b[31mError: No Supabase key found. Need SUPABASE_SERVICE_ROLE_KEY or VITE_SUPABASE_ANON_KEY.\x1b[0m');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, authKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  // ── Step 1: Create Auth User ──────────────────────
  console.log(`\x1b[34m1. Creating Supabase Auth user for ${TARGET_EMAIL}...\x1b[0m`);

  let authUserId;

  if (useServiceRole) {
    // Service role: create confirmed user directly
    const { data, error } = await supabase.auth.admin.createUser({
      email: TARGET_EMAIL,
      password: TARGET_PASSWORD,
      email_confirm: true,
      user_metadata: { name: TARGET_NAME, role: TARGET_ROLE }
    });
    if (error) {
      if (error.message.includes('already been registered') || error.message.includes('already exists')) {
        console.log('\x1b[33m   User already exists. Fetching existing user...\x1b[0m');
        const { data: listData } = await supabase.auth.admin.listUsers();
        const existing = listData?.users?.find(u => u.email === TARGET_EMAIL);
        if (existing) {
          authUserId = existing.id;
          console.log(`\x1b[32m   ✔ Found existing Auth User: ${authUserId}\x1b[0m`);
        } else {
          console.error('\x1b[31m   Could not find existing user.\x1b[0m');
          process.exit(1);
        }
      } else {
        console.error('\x1b[31m   Failed:\x1b[0m', error.message);
        process.exit(1);
      }
    } else {
      authUserId = data.user.id;
      console.log(`\x1b[32m   ✔ Created confirmed Auth User: ${authUserId}\x1b[0m`);
    }
  } else {
    // Anon key: use signUp (user may need to confirm email)
    const { data, error } = await supabase.auth.signUp({
      email: TARGET_EMAIL,
      password: TARGET_PASSWORD,
      options: {
        data: { name: TARGET_NAME, role: TARGET_ROLE }
      }
    });
    if (error) {
      if (error.message.includes('already been registered') || error.message.includes('already exists')) {
        console.log('\x1b[33m   User already registered. Attempting sign-in to get user ID...\x1b[0m');
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email: TARGET_EMAIL,
          password: TARGET_PASSWORD
        });
        if (signInError) {
          console.error('\x1b[31m   Sign-in failed:\x1b[0m', signInError.message);
          console.log('\x1b[33m   The user may need email confirmation. Check inbox.\x1b[0m');
          process.exit(1);
        }
        authUserId = signInData.user.id;
        console.log(`\x1b[32m   ✔ Signed in as existing user: ${authUserId}\x1b[0m`);
      } else {
        console.error('\x1b[31m   Failed:\x1b[0m', error.message);
        process.exit(1);
      }
    } else {
      authUserId = data.user?.id;
      if (!authUserId) {
        console.error('\x1b[31m   SignUp succeeded but no user ID returned. Check if email confirmation is required.\x1b[0m');
        process.exit(1);
      }
      const needsConfirm = data.user?.confirmed_at == null;
      console.log(`\x1b[32m   ✔ Auth User created: ${authUserId}\x1b[0m`);
      if (needsConfirm) {
        console.log('\x1b[33m   ⚠ Email confirmation may be required. Check inbox for confirmation link.\x1b[0m');
      }
    }
  }

  // ── Step 2: Insert Staff Record ───────────────────
  console.log('\x1b[34m2. Creating staff record in database...\x1b[0m');

  const staffId = Date.now();
  const pinHash = hashPin(TARGET_PIN);

  // Check if staff record already exists for this auth user
  const { data: existingStaff } = await supabase
    .from('staff')
    .select('id, name, role')
    .eq('auth_user_id', authUserId)
    .limit(1);

  if (existingStaff && existingStaff.length > 0) {
    console.log(`\x1b[33m   Staff record already exists: id=${existingStaff[0].id}, name="${existingStaff[0].name}", role=${existingStaff[0].role}\x1b[0m`);
    // Update to owner if not already
    if (existingStaff[0].role !== 'owner') {
      await supabase.from('staff').update({ role: 'owner', is_active: true }).eq('id', existingStaff[0].id);
      console.log('\x1b[32m   ✔ Updated role to owner\x1b[0m');
    }
  } else {
    const { error: staffError } = await supabase
      .from('staff')
      .insert({
        id: staffId,
        store_id: STORE_ID,
        name: TARGET_NAME,
        role: TARGET_ROLE,
        pin_hash: pinHash,
        is_active: true,
        auth_user_id: authUserId,
        created_at: new Date().toISOString()
      });

    if (staffError) {
      console.error('\x1b[31m   Failed to create staff record:\x1b[0m', staffError.message);
      // Continue anyway — membership might still work
    } else {
      console.log(`\x1b[32m   ✔ Staff record created (id=${staffId})\x1b[0m`);
    }
  }

  // ── Step 3: Insert Staff Membership ───────────────
  console.log('\x1b[34m3. Creating staff membership for RLS access...\x1b[0m');

  const actualStaffId = (existingStaff && existingStaff.length > 0) ? existingStaff[0].id : staffId;

  const { data: existingMembership } = await supabase
    .from('staff_memberships')
    .select('id')
    .eq('auth_user_id', authUserId)
    .eq('store_id', STORE_ID)
    .limit(1);

  if (existingMembership && existingMembership.length > 0) {
    await supabase
      .from('staff_memberships')
      .update({ role: 'owner', is_active: true })
      .eq('auth_user_id', authUserId)
      .eq('store_id', STORE_ID);
    console.log('\x1b[32m   ✔ Membership already exists, updated to owner\x1b[0m');
  } else {
    const { error: membershipError } = await supabase
      .from('staff_memberships')
      .insert({
        store_id: STORE_ID,
        staff_id: actualStaffId,
        auth_user_id: authUserId,
        role: TARGET_ROLE,
        is_active: true
      });

    if (membershipError) {
      console.error('\x1b[31m   Failed to create membership:\x1b[0m', membershipError.message);
    } else {
      console.log('\x1b[32m   ✔ Membership created\x1b[0m');
    }
  }

  // ── Summary ───────────────────────────────────────
  console.log('\n\x1b[32m═══════════════════════════════════════════════════\x1b[0m');
  console.log('\x1b[32m   ✔ ADMIN PROVISIONING COMPLETE\x1b[0m');
  console.log('\x1b[32m═══════════════════════════════════════════════════\x1b[0m');
  console.log(`   Email:       ${TARGET_EMAIL}`);
  console.log(`   Password:    ${TARGET_PASSWORD}`);
  console.log(`   Role:        ${TARGET_ROLE}`);
  console.log(`   Local PIN:   ${TARGET_PIN}`);
  console.log(`   Auth User:   ${authUserId}`);
  console.log(`   Staff ID:    ${actualStaffId}`);
  console.log('\n   Login via "Enterprise Cloud" tab on the login screen.');
  console.log('   Or use the local PIN as a backup.\n');
}

main().catch(err => {
  console.error('\x1b[31mFatal:\x1b[0m', err);
  process.exit(1);
});
