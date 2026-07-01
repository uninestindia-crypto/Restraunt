import { createClient } from '@supabase/supabase-js';
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import readline from 'readline';

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

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function isNonVeg(itemName) {
  const lower = itemName.toLowerCase();
  return lower.includes('chicken') || 
         lower.includes('chiken') || 
         lower.includes('egg') || 
         lower.includes('fish') || 
         lower.includes('mutton') || 
         lower.includes('meat');
}

async function main() {
  const env = loadEnv();
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const storeId = env.STORE_ID || 'the-taste';

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Error: Missing SUPABASE URL or SERVICE ROLE KEY in .env file.");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  // 1. Fetch Staff list to prompt user dynamically
  console.log("Fetching staff list from database...");
  const { data: staffList, error: staffError } = await supabase
    .from('staff')
    .select('id, name, role, auth_user_id')
    .eq('store_id', storeId)
    .eq('is_active', true);

  if (staffError || !staffList || staffList.length === 0) {
    console.error("Error fetching staff:", staffError || "No active staff found in database.");
    process.exit(1);
  }

  console.log("\nAvailable Staff Members:");
  staffList.forEach((staff, index) => {
    console.log(`[${index + 1}] Name: ${staff.name} | Role: ${staff.role} | Auth User ID: ${staff.auth_user_id}`);
  });

  let selectedStaff = null;
  while (!selectedStaff) {
    const choice = await ask(`\nSelect staff to record these sales under (1-${staffList.length}) or enter custom UUID: `);
    
    // Check if it's a numeric index
    const index = parseInt(choice, 10);
    if (!isNaN(index) && index >= 1 && index <= staffList.length) {
      selectedStaff = staffList[index - 1];
    } else {
      // Validate if it is a valid UUID
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (uuidRegex.test(choice)) {
        selectedStaff = {
          id: null,
          name: "Imported User",
          role: "cashier",
          auth_user_id: choice
        };
      } else {
        console.log("Invalid selection. Please choose a number or paste a valid UUID.");
      }
    }
  }

  console.log(`\nSelected Staff: ${selectedStaff.name} (User ID: ${selectedStaff.auth_user_id})`);

  // 2. Fetch Menu Items to map names to IDs
  console.log("\nFetching menu items to match names...");
  const { data: menuItems, error: menuError } = await supabase
    .from('menu_items')
    .select('id, name, price, is_veg')
    .eq('store_id', storeId);

  if (menuError) {
    console.warn("Warning: Could not fetch menu items. All itemIds will be null. Error:", menuError.message);
  }

  const menuItemLookup = new Map();
  if (menuItems) {
    menuItems.forEach(item => {
      menuItemLookup.set(item.name.toLowerCase().trim(), item);
    });
    console.log(`Loaded ${menuItems.length} menu items for lookup.`);
  }

  // 3. Execute python parser script to extract Excel data
  console.log("\nParsing Excel file using Python...");
  let vouchers = [];
  try {
    const pythonScript = path.resolve('scripts/parse_sales_xlsx.py');
    const stdout = execFileSync('python', [pythonScript], { encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 });
    vouchers = JSON.parse(stdout);
    if (vouchers.error) {
      throw new Error(vouchers.error);
    }
  } catch (err) {
    console.error("Error executing Python Excel parser:", err.message);
    process.exit(1);
  }

  console.log(`Parsed ${vouchers.length} vouchers successfully.`);

  // 4. Map vouchers into database order records
  console.log("\nFormatting orders for database insertion...");
  const ordersToInsert = [];
  
  for (const vch of vouchers) {
    const clientOrderId = crypto.randomUUID();
    
    // Parse payment method
    let paymentMethod = 'cash';
    const methodLower = (vch.payment_method || '').toLowerCase();
    if (methodLower.includes('cash')) {
      paymentMethod = 'cash';
    } else if (methodLower.includes('bank') || methodLower.includes('online') || methodLower.includes('upi') || methodLower.includes('gpay')) {
      paymentMethod = 'upi';
    }

    // Map items list
    let orderSubtotal = 0;
    const orderItems = vch.items.map(item => {
      const cleanedName = item.name.trim();
      const lookupItem = menuItemLookup.get(cleanedName.toLowerCase());
      
      const itemId = lookupItem ? Number(lookupItem.id) : null;
      const price = Number(item.rate) || 0;
      const quantity = Math.round(item.qty); // orders schema uses integer for quantities
      const lineTotal = price * quantity;
      orderSubtotal += lineTotal;

      return {
        itemId,
        itemName: cleanedName,
        price,
        quantity,
        isVeg: lookupItem ? Boolean(lookupItem.is_veg) : !isNonVeg(cleanedName)
      };
    });

    const billAmt = Number(vch.bill_amount) || orderSubtotal;
    // Set timestamp
    const dateStr = vch.date ? `${vch.date}T12:00:00.000Z` : new Date().toISOString();

    ordersToInsert.push({
      store_id: storeId,
      client_order_id: clientOrderId,
      idempotency_key: clientOrderId,
      order_number: `TT-OLD-${vch.vch_no}`,
      display_token: vch.vch_no.slice(-4),
      type: 'takeaway',
      status: 'completed',
      channel: 'pos',
      source: 'pos',
      items: orderItems,
      subtotal: Number(billAmt.toFixed(2)),
      tax: 0.00,
      tax_percent: 0.00,
      delivery_fee: 0.00,
      total: Number(billAmt.toFixed(2)),
      payment_method: paymentMethod,
      payment_status: 'paid',
      payment_reference: 'IMPORTED_SALES',
      payment_verified_at: dateStr,
      payment_verified_by: selectedStaff.name,
      payment_collected_at: dateStr,
      customer_name: 'Cash Customer',
      auth_user_id: selectedStaff.auth_user_id,
      staff_id: selectedStaff.id,
      staff_name: selectedStaff.name,
      requires_server_validation: false,
      validation_status: 'trusted_staff',
      created_at: dateStr,
      completed_at: dateStr,
      updated_at: dateStr
    });
  }

  console.log(`Prepared ${ordersToInsert.length} orders for upload.`);

  // 5. Insert in batches of 50
  const batchSize = 50;
  let successCount = 0;
  console.log(`\nUploading orders in batches of ${batchSize}...`);

  for (let i = 0; i < ordersToInsert.length; i += batchSize) {
    const batch = ordersToInsert.slice(i, i + batchSize);
    const { error } = await supabase
      .from('orders')
      .upsert(batch, { onConflict: 'store_id,order_number' });

    if (error) {
      console.error(`Error uploading batch starting at index ${i}:`, error.message);
      // Fail fast or continue? Let's display warning and continue to upload what we can
    } else {
      successCount += batch.length;
      console.log(`Successfully uploaded batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(ordersToInsert.length / batchSize)} (${successCount}/${ordersToInsert.length} orders)`);
    }
  }

  console.log(`\nImport process finished! Successfully imported ${successCount} out of ${ordersToInsert.length} orders.`);
}

main().catch(error => {
  console.error("Unhandled rejection in import script:", error);
  process.exit(1);
});
