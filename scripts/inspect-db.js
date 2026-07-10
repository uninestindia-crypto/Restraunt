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

const supabase = createClient(url, key, { auth: { persistSession: false } });

async function run() {
  console.log('Fetching last 10 orders from Supabase...');
  const { data: orders, error } = await supabase
    .from('orders')
    .select('id, client_order_id, order_number, status, payment_status, total, created_at, source, channel')
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) {
    console.error('Error fetching orders:', error);
  } else {
    console.log('Last 10 orders in Supabase:');
    console.table(orders);
  }

  console.log('Fetching staff memberships...');
  const { data: memberships, error: mErr } = await supabase
    .from('staff_memberships')
    .select('*');

  if (mErr) {
    console.error('Error fetching memberships:', mErr);
  } else {
    console.table(memberships);
  }

  console.log('Fetching active staff...');
  const { data: staffList, error: sErr } = await supabase
    .from('staff')
    .select('*');

  if (sErr) {
    console.error('Error fetching staff:', sErr);
  } else {
    console.table(staffList);
  }
}

run();
