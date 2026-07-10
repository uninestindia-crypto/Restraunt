import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Parse .env manually
const envPath = path.resolve('d:\\Zeaul\\Restraunt\\.env');
const envContent = fs.readFileSync(envPath, 'utf-8');
const envVars = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    const key = match[1];
    let value = match[2] || '';
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    } else if (value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1);
    }
    envVars[key] = value.trim();
  }
});

const url = envVars.NEXT_PUBLIC_SUPABASE_URL || 'https://scxfkjtrrfgpusyigntx.supabase.co';
const key = envVars.SUPABASE_SERVICE_ROLE_KEY;

if (!key) {
  console.error('No service role key found in .env');
  process.exit(1);
}

// We will use the service client first to see if updating works, and then check RLS
const supabaseService = createClient(url, key, { auth: { persistSession: false } });

// We also simulate a staff client using the anon key and signing in a staff member
const anonKey = envVars.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseStaff = createClient(url, anonKey, { auth: { persistSession: false } });

async function run() {
  console.log('Fetching developer staff details...');
  const { data: staff, error: sErr } = await supabaseService
    .from('staff')
    .select('id, auth_user_id')
    .eq('role', 'developer')
    .limit(1)
    .single();

  if (sErr) {
    console.error('Error fetching developer:', sErr);
    process.exit(1);
  }

  // Sign in as developer
  console.log('Signing in as developer...');
  const { data: authData, error: aErr } = await supabaseStaff.auth.signInWithPassword({
    email: envVars.ADMIN_EMAIL || 'developer@nextgenos.com',
    password: envVars.ADMIN_PASSWORD || 'DevPassword123!'
  });

  if (aErr) {
    console.error('Failed to sign in:', aErr);
    process.exit(1);
  }

  console.log('Successfully signed in. Token UID:', authData.user.id);

  // Fetch the first confirmed order
  const { data: orders, error: oErr } = await supabaseStaff
    .from('orders')
    .select('*')
    .eq('status', 'confirmed')
    .limit(1);

  if (oErr) {
    console.error('Error fetching orders:', oErr);
    process.exit(1);
  }

  if (orders.length === 0) {
    console.log('No confirmed orders found to test.');
    process.exit(0);
  }

  const order = orders[0];
  console.log(`Testing status update for order ${order.order_number} to "cancelled"...`);

  const { data: updateData, error: uErr } = await supabaseStaff
    .from('orders')
    .update({ status: 'cancelled' })
    .eq('id', order.id)
    .select();

  if (uErr) {
    console.error('Update failed via staff client:', uErr);
  } else {
    console.log('Update succeeded! Response:', updateData);
  }
}

run();
