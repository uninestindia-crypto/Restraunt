import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const DEFAULT_STORE_ID = 'the-taste';

const NEW_CATEGORIES = [
  { name: 'Fries', icon: '🍟', sort_order: 1 },
  { name: 'Roll / Wrap', icon: '🌯', sort_order: 2 },
  { name: 'Fried Rice', icon: '🍚', sort_order: 3 },
  { name: 'Noodles', icon: '🍜', sort_order: 4 },
  { name: 'Biryani', icon: '🍲', sort_order: 5 },
  { name: 'Soup', icon: '🥣', sort_order: 6 },
  { name: 'Veg Chinese', icon: '🥦', sort_order: 7 },
  { name: 'Non-Veg Chinese', icon: '🍗', sort_order: 8 },
  { name: 'Veg Burger', icon: '🍔', sort_order: 9 },
  { name: 'Egg Burger', icon: '🥚', sort_order: 10 },
  { name: 'Chicken Burger', icon: '🍔', sort_order: 11 }
];

const NEW_MENU_ITEMS = [
  // Fries
  ['Fries', 'French Fries', 80, true],
  ['Fries', 'Masala Fries', 90, true],
  ['Fries', 'Chicken Crispy', 120, false],
  // Roll / Wrap
  ['Roll / Wrap', 'Veg Roll', 65, true],
  ['Roll / Wrap', 'Egg Roll', 70, false],
  ['Roll / Wrap', 'Double Egg Roll', 80, false],
  ['Roll / Wrap', 'Paneer Roll', 100, true],
  ['Roll / Wrap', 'Paneer Cheese Roll', 110, true],
  ['Roll / Wrap', 'Paneer Schezwan Roll', 110, true],
  ['Roll / Wrap', 'Chicken Roll', 100, false],
  ['Roll / Wrap', 'Chicken Cheese Roll', 110, false],
  ['Roll / Wrap', 'Combi Chicken Roll', 120, false],
  // Fried Rice
  ['Fried Rice', 'Veg Fried Rice (Half)', 80, true],
  ['Fried Rice', 'Veg Fried Rice (Full)', 130, true],
  ['Fried Rice', 'Veg Schezwan Fried Rice (Half)', 90, true],
  ['Fried Rice', 'Veg Schezwan Fried Rice (Full)', 150, true],
  ['Fried Rice', 'Paneer Fried Rice (Half)', 100, true],
  ['Fried Rice', 'Paneer Fried Rice (Full)', 170, true],
  ['Fried Rice', 'Paneer Schezwan Fried Rice (Half)', 110, true],
  ['Fried Rice', 'Paneer Schezwan Fried Rice (Full)', 190, true],
  ['Fried Rice', 'Egg Fried Rice (Half)', 90, false],
  ['Fried Rice', 'Egg Fried Rice (Full)', 150, false],
  ['Fried Rice', 'Egg Schezwan Fried Rice (Half)', 100, false],
  ['Fried Rice', 'Egg Schezwan Fried Rice (Full)', 170, false],
  ['Fried Rice', 'Chicken Fried Rice (Half)', 100, false],
  ['Fried Rice', 'Chicken Fried Rice (Full)', 170, false],
  ['Fried Rice', 'Chicken Schezwan Fried Rice (Half)', 100, false],
  ['Fried Rice', 'Chicken Schezwan Fried Rice (Full)', 190, false],
  // Noodles
  ['Noodles', 'Veg Noodles (Half)', 80, true],
  ['Noodles', 'Veg Noodles (Full)', 130, true],
  ['Noodles', 'Veg Schezwan Noodles (Half)', 90, true],
  ['Noodles', 'Veg Schezwan Noodles (Full)', 150, true],
  ['Noodles', 'Paneer Noodles (Half)', 100, true],
  ['Noodles', 'Paneer Noodles (Full)', 170, true],
  ['Noodles', 'Paneer Schezwan Noodles (Half)', 110, true],
  ['Noodles', 'Paneer Schezwan Noodles (Full)', 190, true],
  ['Noodles', 'Egg Noodles (Half)', 90, false],
  ['Noodles', 'Egg Noodles (Full)', 150, false],
  ['Noodles', 'Egg Schezwan Noodles (Half)', 100, false],
  ['Noodles', 'Egg Schezwan Noodles (Full)', 170, false],
  ['Noodles', 'Chicken Noodles (Half)', 100, false],
  ['Noodles', 'Chicken Noodles (Full)', 170, false],
  ['Noodles', 'Chicken Schezwan Noodles (Half)', 110, false],
  ['Noodles', 'Chicken Schezwan Noodles (Full)', 190, false],
  // Biryani
  ['Biryani', 'Biryani (Half)', 100, false],
  ['Biryani', 'Biryani (Full)', 160, false],
  // Soup
  ['Soup', 'Veg Hot And Sour Soup (Half)', 60, true],
  ['Soup', 'Veg Hot And Sour Soup (Full)', 90, true],
  ['Soup', 'Veg Manchow Soup (Half)', 70, true],
  ['Soup', 'Veg Manchow Soup (Full)', 110, true],
  ['Soup', 'Chicken Clear Soup (Half)', 70, false],
  ['Soup', 'Chicken Clear Soup (Full)', 110, false],
  ['Soup', 'Chicken Hot And Sour Soup (Half)', 70, false],
  ['Soup', 'Chicken Hot And Sour Soup (Full)', 110, false],
  ['Soup', 'Chicken Manchow Soup (Half)', 80, false],
  ['Soup', 'Chicken Manchow Soup (Full)', 120, false],
  ['Soup', 'Chicken Noodle Soup (Half)', 70, false],
  ['Soup', 'Chicken Noodle Soup (Full)', 120, false],
  // Veg Chinese
  ['Veg Chinese', 'Veg Manchurian', 149, true],
  ['Veg Chinese', 'Veg 65', 159, true],
  ['Veg Chinese', 'Paneer Chilli', 200, true],
  ['Veg Chinese', 'Paneer Manchurian', 175, true],
  ['Veg Chinese', 'Mushroom Chilli', 250, true],
  ['Veg Chinese', 'Baby Corn Chilli', 240, true],
  // Non-Veg Chinese
  ['Non-Veg Chinese', 'Chicken Manchurian', 179, false],
  ['Non-Veg Chinese', 'Chicken Shezwan', 189, false],
  ['Non-Veg Chinese', 'Bone Chilli', 200, false],
  ['Non-Veg Chinese', 'Chicken Lollipop', 300, false],
  ['Non-Veg Chinese', 'Chicken Chilli', 220, false],
  ['Non-Veg Chinese', 'Chicken 65', 240, false],
  ['Non-Veg Chinese', 'Chicken Boneless', 170, false],
  // Veg Burger
  ['Veg Burger', 'Veg Burger', 70, true],
  ['Veg Burger', 'Veg Cheese Burger', 90, true],
  ['Veg Burger', 'Veg Double Cheese Burger', 110, true],
  // Egg Burger
  ['Egg Burger', 'Egg Burger', 50, false],
  ['Egg Burger', 'Egg Cheese Burger', 70, false],
  ['Egg Burger', 'Egg Double Cheese Burger', 90, false],
  // Chicken Burger
  ['Chicken Burger', 'Chicken Burger', 80, false],
  ['Chicken Burger', 'Chicken Cheese Burger', 100, false],
  ['Chicken Burger', 'Chicken Double Cheese Burger', 120, false]
];

function loadEnv() {
  const vars = { ...process.env };
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
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const storeId = env.STORE_ID || DEFAULT_STORE_ID;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Error: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be defined in .env');
    process.exit(1);
  }

  console.log(`Connecting to Supabase at ${supabaseUrl}...`);
  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  // 1. Delete existing items
  console.log(`Deleting existing menu items for store: ${storeId}...`);
  const { error: delItemsErr } = await client
    .from('menu_items')
    .delete()
    .eq('store_id', storeId);
  if (delItemsErr) throw delItemsErr;

  // 2. Delete existing categories
  console.log(`Deleting existing menu categories for store: ${storeId}...`);
  const { error: delCatsErr } = await client
    .from('menu_categories')
    .delete()
    .eq('store_id', storeId);
  if (delCatsErr) throw delCatsErr;

  // 3. Insert categories
  console.log('Inserting new categories...');
  const catRows = NEW_CATEGORIES.map((cat, idx) => ({
    id: idx + 1,
    store_id: storeId,
    name: cat.name,
    icon: cat.icon,
    sort_order: cat.sort_order,
    is_active: true,
    updated_at: new Date().toISOString()
  }));

  const { data: insertedCats, error: insCatsErr } = await client
    .from('menu_categories')
    .insert(catRows)
    .select();
  if (insCatsErr) throw insCatsErr;
  console.log(`Successfully inserted ${insertedCats.length} categories.`);

  // Create a mapping of category name to ID
  const catMap = new Map(insertedCats.map(cat => [cat.name, cat.id]));

  // 4. Insert menu items
  console.log('Inserting new menu items...');
  const itemRows = NEW_MENU_ITEMS.map(([categoryName, name, price, isVeg], index) => {
    const categoryId = catMap.get(categoryName);
    if (!categoryId) {
      throw new Error(`Category matching "${categoryName}" was not found!`);
    }
    return {
      id: index + 1,
      store_id: storeId,
      category_id: categoryId,
      name,
      price: Number(price),
      is_available: true,
      is_veg: isVeg,
      sort_order: index + 1,
      image_url: '',
      updated_at: new Date().toISOString()
    };
  });

  const { data: insertedItems, error: insItemsErr } = await client
    .from('menu_items')
    .insert(itemRows)
    .select();
  if (insItemsErr) throw insItemsErr;

  console.log(`Successfully inserted ${insertedItems.length} menu items.`);
  console.log('Menu update complete in Supabase!');
}

main().catch(err => {
  console.error('Failed to update menu in Supabase:', err);
  process.exit(1);
});
