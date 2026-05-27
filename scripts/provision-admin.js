/**
 * ═══════════════════════════════════════════════════
 *  NextGenOS — Quick Admin Provisioner
 *  Creates a Supabase Auth user + staff record + membership
 *  for the given email/password with owner role.
 *
 *  NOTE: This script needs the SUPABASE_SERVICE_ROLE_KEY to
 *  bypass RLS for the initial staff_memberships insert.
 *  Add it to .env.deploy: SUPABASE_SERVICE_ROLE_KEY=eyJ...
 *
 *  Get it from: Supabase Dashboard → Settings → API → service_role
 * ═══════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import readline from 'readline';

// ── Config ──────────────────────────────────────────
const TARGET_EMAIL    = 'mohammadjalaluddin1010@gmail.com';
const TARGET_PASSWORD = '123456';
const TARGET_NAME     = 'Mohammad Jalaluddin';
const TARGET_ROLE     = 'owner';
const TARGET_PIN      = '6070';  // Local backup PIN (not 1234!)
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

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, ans => { rl.close(); resolve(ans.trim()); }));
}

async function main() {
  console.log('\n\x1b[35m═══════════════════════════════════════════════════\x1b[0m');
  console.log('\x1b[36m    NextGenOS — Admin Provisioner                  \x1b[0m');
  console.log('\x1b[35m═══════════════════════════════════════════════════\x1b[0m\n');

  const env = loadEnv();
  const supabaseUrl = env.VITE_SUPABASE_URL || '';

  if (!supabaseUrl) {
    console.error('\x1b[31mError: VITE_SUPABASE_URL not found in .env\x1b[0m');
    process.exit(1);
  }

  // We MUST have the service role key to bypass RLS for initial bootstrapping
  let serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!serviceRoleKey) {
    console.log('\x1b[33m⚠ SUPABASE_SERVICE_ROLE_KEY not found in .env or .env.deploy\x1b[0m');
    console.log('\x1b[33m  Get it from: Supabase Dashboard → Settings → API → service_role (secret)\x1b[0m\n');
    serviceRoleKey = await ask('\x1b[36mPaste your Service Role Key: \x1b[0m');
    if (!serviceRoleKey) {
      console.error('\x1b[31mCannot proceed without the service role key (needed to bypass RLS).\x1b[0m');
      process.exit(1);
    }
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  // ── Step 1: Create Auth User ──────────────────────
  console.log(`\x1b[34m1. Creating Supabase Auth user for ${TARGET_EMAIL}...\x1b[0m`);

  let authUserId;

  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: TARGET_EMAIL,
    password: TARGET_PASSWORD,
    email_confirm: true,
    user_metadata: { name: TARGET_NAME, role: TARGET_ROLE }
  });

  if (authError) {
    if (authError.message.includes('already been registered') || authError.message.includes('already exists')) {
      console.log('\x1b[33m   User already exists. Fetching...\x1b[0m');
      const { data: listData } = await supabase.auth.admin.listUsers();
      const existing = listData?.users?.find(u => u.email === TARGET_EMAIL);
      if (existing) {
        authUserId = existing.id;
        // Update password in case it changed
        await supabase.auth.admin.updateUserById(authUserId, { password: TARGET_PASSWORD, email_confirm: true });
        console.log(`\x1b[32m   ✔ Found and updated existing Auth User: ${authUserId}\x1b[0m`);
      } else {
        console.error('\x1b[31m   Could not find existing user.\x1b[0m');
        process.exit(1);
      }
    } else {
      console.error('\x1b[31m   Failed:\x1b[0m', authError.message);
      process.exit(1);
    }
  } else {
    authUserId = authData.user.id;
    console.log(`\x1b[32m   ✔ Created confirmed Auth User: ${authUserId}\x1b[0m`);
  }

  // ── Step 2: Insert Staff Record ───────────────────
  console.log('\x1b[34m2. Creating staff record in database...\x1b[0m');

  // Use a small integer ID that fits in BIGINT and doesn't collide
  // Query for max existing ID to avoid collision
  const { data: maxRow } = await supabase.from('staff').select('id').order('id', { ascending: false }).limit(1);
  const staffId = (maxRow && maxRow.length > 0) ? maxRow[0].id + 1 : 1;
  const pinHash = hashPin(TARGET_PIN);

  // Check if staff record already exists for this auth user
  const { data: existingStaff } = await supabase
    .from('staff')
    .select('id, name, role')
    .eq('auth_user_id', authUserId)
    .limit(1);

  let actualStaffId;

  if (existingStaff && existingStaff.length > 0) {
    actualStaffId = existingStaff[0].id;
    console.log(`\x1b[33m   Staff record already exists: id=${actualStaffId}, name="${existingStaff[0].name}", role=${existingStaff[0].role}\x1b[0m`);
    // Update to owner if not already
    const { error: updateErr } = await supabase
      .from('staff')
      .update({ role: 'owner', is_active: true, pin_hash: pinHash })
      .eq('id', actualStaffId);
    if (updateErr) {
      console.error('\x1b[31m   Update failed:\x1b[0m', updateErr.message);
    } else {
      console.log('\x1b[32m   ✔ Updated to owner role\x1b[0m');
    }
  } else {
    actualStaffId = staffId;
    const { error: staffError } = await supabase
      .from('staff')
      .insert({
        id: actualStaffId,
        store_id: STORE_ID,
        name: TARGET_NAME,
        role: TARGET_ROLE,
        pin_hash: pinHash,
        is_active: true,
        auth_user_id: authUserId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

    if (staffError) {
      console.error('\x1b[31m   Failed to create staff record:\x1b[0m', staffError.message);
    } else {
      console.log(`\x1b[32m   ✔ Staff record created (id=${actualStaffId})\x1b[0m`);
    }
  }

  // ── Step 3: Insert Staff Membership ───────────────
  console.log('\x1b[34m3. Creating staff membership for RLS access...\x1b[0m');

  const { data: existingMembership } = await supabase
    .from('staff_memberships')
    .select('id')
    .eq('auth_user_id', authUserId)
    .eq('store_id', STORE_ID)
    .limit(1);

  if (existingMembership && existingMembership.length > 0) {
    const { error: updErr } = await supabase
      .from('staff_memberships')
      .update({ role: 'owner', is_active: true, staff_id: actualStaffId })
      .eq('auth_user_id', authUserId)
      .eq('store_id', STORE_ID);
    if (updErr) {
      console.error('\x1b[31m   Membership update failed:\x1b[0m', updErr.message);
    } else {
      console.log('\x1b[32m   ✔ Membership already exists, updated to owner\x1b[0m');
    }
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
  console.log('   Or use local PIN as backup.\n');
}

main().catch(err => {
  console.error('\x1b[31mFatal:\x1b[0m', err);
  process.exit(1);
});
