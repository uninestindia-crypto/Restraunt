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
const anonKey = envVars.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Simulate Owner Client
const supabaseOwner = createClient(url, anonKey, { auth: { persistSession: false } });

async function run() {
  console.log('Signing in as Owner (mohammadjalaluddin1010@gmail.com)...');
  const { data: authData, error: aErr } = await supabaseOwner.auth.signInWithPassword({
    email: 'mohammadjalaluddin1010@gmail.com',
    password: envVars.ADMIN_PASSWORD || 'DevPassword123!' // assuming they use the same or we check
  });

  if (aErr) {
    console.error('Failed to sign in as Owner:', aErr);
    process.exit(1);
  }

  console.log('Successfully signed in as Owner. Token UID:', authData.user.id);

  console.log('Querying menu_categories...');
  const { data: categories, error: catErr } = await supabaseOwner
    .from('menu_categories')
    .select('*')
    .eq('store_id', 'the-taste');

  if (catErr) {
    console.error('Failed to read categories:', catErr);
  } else {
    console.log(`Success! Read ${categories.length} categories.`);
  }

  console.log('Querying menu_items...');
  const { data: items, error: itemErr } = await supabaseOwner
    .from('menu_items')
    .select('*')
    .eq('store_id', 'the-taste');

  if (itemErr) {
    console.error('Failed to read items:', itemErr);
  } else {
    console.log(`Success! Read ${items.length} items.`);
  }
}

run();
