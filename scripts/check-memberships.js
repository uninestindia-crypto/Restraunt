import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://scxfkjtrrfgpusyigntx.supabase.co';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!key) {
  console.error('No service role key found in process.env');
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

async function run() {
  console.log('Fetching staff memberships...');
  const { data, error } = await supabase
    .from('staff_memberships')
    .select('*');

  if (error) {
    console.error('Error fetching memberships:', error);
  } else {
    console.table(data);
  }
}

run();
