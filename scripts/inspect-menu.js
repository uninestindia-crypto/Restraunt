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
  console.log('Fetching all menu categories from Supabase...');
  const { data: categories, error: catErr } = await supabase
    .from('menu_categories')
    .select('id, name, icon, sort_order, is_active')
    .order('sort_order', { ascending: true });

  if (catErr) {
    console.error('Error fetching categories:', catErr);
  } else {
    console.log(`Found ${categories.length} categories:`);
    console.table(categories);
  }

  console.log('Fetching all menu items from Supabase...');
  const { data: items, error } = await supabase
    .from('menu_items')
    .select('id, name, price, category_id, store_id')
    .order('category_id', { ascending: true })
    .order('name', { ascending: true });

  if (error) {
    console.error('Error fetching menu items:', error);
  } else {
    console.log(`Found ${items.length} menu items:`);
    console.table(items);
  }
}

run();
