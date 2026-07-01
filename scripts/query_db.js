import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

function loadEnv() {
  const vars = {};
  const filePath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(filePath)) {
    for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*([^#=]+)\s*=\s*(.*)\s*$/);
      if (!match) continue;
      let value = match[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      vars[match[1].trim()] = value;
    }
  }
  return vars;
}

async function main() {
  const env = loadEnv();
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Missing SUPABASE URL or SERVICE ROLE KEY");
    return;
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  // Query staff
  const { data: staff, error: staffError } = await supabase
    .from('staff')
    .select('id, name, role, auth_user_id');
  if (staffError) {
    console.error("Error fetching staff:", staffError);
  } else {
    console.log("=== STAFF ===");
    console.log(staff);
  }

  // Query menu items (first 10)
  const { data: menuItems, error: menuError } = await supabase
    .from('menu_items')
    .select('id, name, price');
  if (menuError) {
    console.error("Error fetching menu items:", menuError);
  } else {
    console.log(`=== MENU ITEMS (Total: ${menuItems.length}) ===`);
    console.log(menuItems.slice(0, 10));
  }
}

main().catch(console.error);
