import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://scxfkjtrrfgpusyigntx.supabase.co';
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const email = process.env.ADMIN_EMAIL || 'developer@nextgenos.com';
const password = process.env.ADMIN_PASSWORD || 'DevPassword123!';

if (!key || !email || !password) {
  console.error('Missing key, email, or password in process.env');
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

async function run() {
  console.log(`Logging in as ${email}...`);
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (authError) {
    console.error('Login failed:', authError);
    process.exit(1);
  }

  const token = authData.session.access_token;
  console.log('Login successful! UID:', authData.user.id);

  // Create client with authenticated token headers
  const authSupabase = createClient(url, key, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`
      }
    },
    auth: { persistSession: false }
  });

  const remoteOrder = {
    store_id: 'the-taste',
    client_order_id: '9ef47a86-4ddf-4ed4-8517-cf03e0946a82',
    idempotency_key: '9ef47a86-4ddf-4ed4-8517-cf03e0946a82',
    order_number: 'TEST-ORDER-67890',
    display_token: '67890',
    type: 'takeaway',
    status: 'pending',
    channel: 'pos',
    source: 'pos',
    items: [],
    subtotal: 100,
    tax: 0,
    tax_percent: 0,
    delivery_fee: 0,
    total: 100,
    payment_method: 'cash',
    payment_status: 'paid',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  console.log('Inserting remoteOrder under authenticated staff user session...');
  const { data, error } = await authSupabase
    .from('orders')
    .insert(remoteOrder)
    .select('id')
    .single();

  if (error) {
    console.error('Error inserting order:', error);
  } else {
    console.log('Success! Data returned:', data);
    // Cleanup the inserted order so we don't spam the DB
    console.log('Cleaning up inserted test order...');
    await authSupabase.from('orders').delete().eq('id', data.id);
  }
}

run();
