import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://scxfkjtrrfgpusyigntx.supabase.co';
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

if (!key) {
  console.error('No anon key found in process.env');
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

async function run() {
  const payload = {
    clientOrderId: '7ef47a86-4ddf-4ed4-8517-cf03e0946a89',
    idempotencyKey: '7ef47a86-4ddf-4ed4-8517-cf03e0946a89',
    type: 'takeaway',
    channel: 'online',
    source: 'online',
    tableId: null,
    customer: {
      name: 'Test Customer',
      phone: '9876543210'
    },
    delivery: {
      address: '',
      landmark: '',
      notes: ''
    },
    payment: {
      method: 'cash'
    },
    items: [
      {
        itemId: 1, // Let's check if momos or another item exists
        quantity: 1,
        notes: 'Test item'
      }
    ]
  };

  console.log('Invoking public-order edge function with payload:', payload);
  const { data, error } = await supabase.functions.invoke('public-order', { body: payload });

  if (error) {
    console.error('Edge Function returned network/transport error:', error);
    try {
      const body = await error.context?.json?.();
      console.log('Error response body:', body);
    } catch (_) {}
  } else {
    console.log('Edge Function Response Data:', data);
  }
}

run();
