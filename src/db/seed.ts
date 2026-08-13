import { db, generateLocalUuid, getDisplayToken } from './database';

/**
 * Seeds the database with initial data if empty.
 * Cloud-first: If Supabase has data, pull from cloud instead of seeding locally.
 * This ensures new devices always get the real production data.
 */
export async function seedDatabase(options: { publicOnly?: boolean } = {}) {
  const { publicOnly = false } = options;

  // Staff startup remains cloud-first for cross-device consistency. Public
  // startup must never block first paint on network retries; CustomerApp
  // refreshes its catalog from Supabase after rendering the local cache.
  const MAX_HYDRATION_RETRIES = 3;
  const HYDRATION_RETRY_DELAY_MS = 1500;
  let cloudHydrated = false;

  for (let attempt = 1; !publicOnly && attempt <= MAX_HYDRATION_RETRIES; attempt++) {
    try {
      // Wait for network readiness on retry attempts
      if (attempt > 1) {
        console.log(`[Seed] Cloud hydration retry ${attempt}/${MAX_HYDRATION_RETRIES} in ${HYDRATION_RETRY_DELAY_MS}ms...`);
        await new Promise(r => setTimeout(r, HYDRATION_RETRY_DELAY_MS));
        if (!navigator.onLine) {
          console.warn(`[Seed] Still offline on attempt ${attempt}. Skipping.`);
          continue;
        }
      }

      const { cloudHasData, fullPull } = await import('../services/cloudDb');
      const hasCloudData = await cloudHasData();
      if (hasCloudData) {
        console.log(`[Seed] Cloud data detected on attempt ${attempt} — hydrating from Supabase instead of local seeds.`);
        await fullPull({ publicOnly });
        cloudHydrated = true;
        // Still run migrations below, but skip seed data
        await runMigrations();
        if (!publicOnly) {
          await ensureDefaultTables();
        }
        return;
      } else {
        // Cloud is reachable and genuinely empty (no error thrown) — proceed to local seed immediately without retry
        console.log(`[Seed] Cloud is reachable but empty. Proceeding to local seed.`);
        break;
      }
    } catch (err) {
      console.warn(`[Seed] Cloud hydration attempt ${attempt} failed:`, err.message);
      if (attempt >= MAX_HYDRATION_RETRIES) {
        console.warn('[Seed] All cloud hydration attempts exhausted. Proceeding with local data.');
      }
    }
  }

  // Run local compatibility cleanup on the normal seed path too.
  await runMigrations();

  if (!publicOnly) {
    await ensureDefaultTables();
  }

  const existingCategories = await db.menuCategories.count();
  const existingItems = await db.menuItems.count();
  if (existingCategories > 0 && existingItems > 0) {
    return; // Data already exists
  }
  if (existingCategories > 0 && existingItems === 0) {
    console.warn('[Seed] Local categories exist without menu items. Rebuilding public menu cache.');
    await db.menuCategories.clear();
  }

  const seedStores = publicOnly
    ? [db.menuCategories, db.menuItems, db.settings]
    : [db.menuCategories, db.menuItems, db.settings, db.inventory, db.suppliers, db.customers, db.orders];

  await (db.transaction as any)('rw', ...seedStores, async () => {
    // ── Categories ──────────────────────────────────────────────
    const categories = [
      { name: 'Fries', icon: '🍟', sortOrder: 1, isActive: 1, isSynced: 0 },
      { name: 'Roll / Wrap', icon: '🌯', sortOrder: 2, isActive: 1, isSynced: 0 },
      { name: 'Fried Rice', icon: '🍚', sortOrder: 3, isActive: 1, isSynced: 0 },
      { name: 'Noodles', icon: '🍜', sortOrder: 4, isActive: 1, isSynced: 0 },
      { name: 'Biryani', icon: '🍲', sortOrder: 5, isActive: 1, isSynced: 0 },
      { name: 'Soup', icon: '🥣', sortOrder: 6, isActive: 1, isSynced: 0 },
      { name: 'Veg Chinese', icon: '🥦', sortOrder: 7, isActive: 1, isSynced: 0 },
      { name: 'Non-Veg Chinese', icon: '🍗', sortOrder: 8, isActive: 1, isSynced: 0 },
      { name: 'Veg Burger', icon: '🍔', sortOrder: 9, isActive: 1, isSynced: 0 },
      { name: 'Egg Burger', icon: '🥚', sortOrder: 10, isActive: 1, isSynced: 0 },
      { name: 'Chicken Burger', icon: '🍔', sortOrder: 11, isActive: 1, isSynced: 0 },
    ];

    const categoryIds = await db.menuCategories.bulkAdd(categories, { allKeys: true });

    // Map category names to their IDs for easy reference
    const catMap = {};
    categories.forEach((cat, idx) => {
      catMap[cat.name] = categoryIds[idx];
    });

    // ── Menu Items ──────────────────────────────────────────────
    let sortOrder = 0;
    const menuItems = [];

    const addItem = (categoryName, name, price, isVeg) => {
      sortOrder++;
      menuItems.push({
        categoryId: catMap[categoryName],
        name,
        price,
        isVeg: isVeg ? 1 : 0,
        isAvailable: 1,
        sortOrder,
        isSynced: 0
      });
    };

    // Fries
    addItem('Fries', 'French Fries', 80, true);
    addItem('Fries', 'Masala Fries', 90, true);
    addItem('Fries', 'Chicken Crispy', 120, false);

    // Roll / Wrap
    addItem('Roll / Wrap', 'Veg Roll', 65, true);
    addItem('Roll / Wrap', 'Egg Roll', 70, false);
    addItem('Roll / Wrap', 'Double Egg Roll', 80, false);
    addItem('Roll / Wrap', 'Paneer Roll', 100, true);
    addItem('Roll / Wrap', 'Paneer Cheese Roll', 110, true);
    addItem('Roll / Wrap', 'Paneer Schezwan Roll', 110, true);
    addItem('Roll / Wrap', 'Chicken Roll', 100, false);
    addItem('Roll / Wrap', 'Chicken Cheese Roll', 110, false);
    addItem('Roll / Wrap', 'Combi Chicken Roll', 120, false);

    // Fried Rice
    addItem('Fried Rice', 'Veg Fried Rice (Half)', 80, true);
    addItem('Fried Rice', 'Veg Fried Rice (Full)', 130, true);
    addItem('Fried Rice', 'Veg Schezwan Fried Rice (Half)', 90, true);
    addItem('Fried Rice', 'Veg Schezwan Fried Rice (Full)', 150, true);
    addItem('Fried Rice', 'Paneer Fried Rice (Half)', 100, true);
    addItem('Fried Rice', 'Paneer Fried Rice (Full)', 170, true);
    addItem('Fried Rice', 'Paneer Schezwan Fried Rice (Half)', 110, true);
    addItem('Fried Rice', 'Paneer Schezwan Fried Rice (Full)', 190, true);
    addItem('Fried Rice', 'Egg Fried Rice (Half)', 90, false);
    addItem('Fried Rice', 'Egg Fried Rice (Full)', 150, false);
    addItem('Fried Rice', 'Egg Schezwan Fried Rice (Half)', 100, false);
    addItem('Fried Rice', 'Egg Schezwan Fried Rice (Full)', 170, false);
    addItem('Fried Rice', 'Chicken Fried Rice (Half)', 100, false);
    addItem('Fried Rice', 'Chicken Fried Rice (Full)', 170, false);
    addItem('Fried Rice', 'Chicken Schezwan Fried Rice (Half)', 100, false);
    addItem('Fried Rice', 'Chicken Schezwan Fried Rice (Full)', 190, false);

    // Noodles
    addItem('Noodles', 'Veg Noodles (Half)', 80, true);
    addItem('Noodles', 'Veg Noodles (Full)', 130, true);
    addItem('Noodles', 'Veg Schezwan Noodles (Half)', 90, true);
    addItem('Noodles', 'Veg Schezwan Noodles (Full)', 150, true);
    addItem('Noodles', 'Paneer Noodles (Half)', 100, true);
    addItem('Noodles', 'Paneer Noodles (Full)', 170, true);
    addItem('Noodles', 'Paneer Schezwan Noodles (Half)', 110, true);
    addItem('Noodles', 'Paneer Schezwan Noodles (Full)', 190, true);
    addItem('Noodles', 'Egg Noodles (Half)', 90, false);
    addItem('Noodles', 'Egg Noodles (Full)', 150, false);
    addItem('Noodles', 'Egg Schezwan Noodles (Half)', 100, false);
    addItem('Noodles', 'Egg Schezwan Noodles (Full)', 170, false);
    addItem('Noodles', 'Chicken Noodles (Half)', 100, false);
    addItem('Noodles', 'Chicken Noodles (Full)', 170, false);
    addItem('Noodles', 'Chicken Schezwan Noodles (Half)', 110, false);
    addItem('Noodles', 'Chicken Schezwan Noodles (Full)', 190, false);

    // Biryani
    addItem('Biryani', 'Biryani (Half)', 100, false);
    addItem('Biryani', 'Biryani (Full)', 160, false);

    // Soup
    addItem('Soup', 'Veg Hot And Sour Soup (Half)', 60, true);
    addItem('Soup', 'Veg Hot And Sour Soup (Full)', 90, true);
    addItem('Soup', 'Veg Manchow Soup (Half)', 70, true);
    addItem('Soup', 'Veg Manchow Soup (Full)', 110, true);
    addItem('Soup', 'Chicken Clear Soup (Half)', 70, false);
    addItem('Soup', 'Chicken Clear Soup (Full)', 110, false);
    addItem('Soup', 'Chicken Hot And Sour Soup (Half)', 70, false);
    addItem('Soup', 'Chicken Hot And Sour Soup (Full)', 110, false);
    addItem('Soup', 'Chicken Manchow Soup (Half)', 80, false);
    addItem('Soup', 'Chicken Manchow Soup (Full)', 120, false);
    addItem('Soup', 'Chicken Noodle Soup (Half)', 70, false);
    addItem('Soup', 'Chicken Noodle Soup (Full)', 120, false);

    // Veg Chinese
    addItem('Veg Chinese', 'Veg Manchurian', 149, true);
    addItem('Veg Chinese', 'Veg 65', 159, true);
    addItem('Veg Chinese', 'Paneer Chilli', 200, true);
    addItem('Veg Chinese', 'Paneer Manchurian', 175, true);
    addItem('Veg Chinese', 'Mushroom Chilli', 250, true);
    addItem('Veg Chinese', 'Baby Corn Chilli', 240, true);

    // Non-Veg Chinese
    addItem('Non-Veg Chinese', 'Chicken Manchurian', 179, false);
    addItem('Non-Veg Chinese', 'Chicken Shezwan', 189, false);
    addItem('Non-Veg Chinese', 'Bone Chilli', 200, false);
    addItem('Non-Veg Chinese', 'Chicken Lollipop', 300, false);
    addItem('Non-Veg Chinese', 'Chicken Chilli', 220, false);
    addItem('Non-Veg Chinese', 'Chicken 65', 240, false);
    addItem('Non-Veg Chinese', 'Chicken Boneless', 170, false);

    // Veg Burger
    addItem('Veg Burger', 'Veg Burger', 70, true);
    addItem('Veg Burger', 'Veg Cheese Burger', 90, true);
    addItem('Veg Burger', 'Veg Double Cheese Burger', 110, true);

    // Egg Burger
    addItem('Egg Burger', 'Egg Burger', 50, false);
    addItem('Egg Burger', 'Egg Cheese Burger', 70, false);
    addItem('Egg Burger', 'Egg Double Cheese Burger', 90, false);

    // Chicken Burger
    addItem('Chicken Burger', 'Chicken Burger', 80, false);
    addItem('Chicken Burger', 'Chicken Cheese Burger', 100, false);
    addItem('Chicken Burger', 'Chicken Double Cheese Burger', 120, false);

    await db.menuItems.bulkAdd(menuItems);

    // ── Default Settings ────────────────────────────────────────
    const defaultSettings = [
      { key: 'restaurantName', value: 'The Taste' },
      { key: 'restaurantTagline', value: 'Chinese Food — Fresh & Reasonable' },
      { key: 'restaurantPhone', value: '' },
      { key: 'restaurantAddress', value: 'Sandalpur Road, Kumhrar, Patna, Bihar' },
      { key: 'upiId', value: '' },
      { key: 'upiName', value: 'The Taste' },
      { key: 'gstPercent', value: '5' },
      { key: 'printerWidth', value: '58' },
      { key: 'orderNumberPrefix', value: 'TT' },
    ];

    await db.settings.bulkPut(defaultSettings);

    if (publicOnly) {
      return;
    }

    // ── Inventory Seeding ───────────────────────────────────────
    const inventoryItems = [
      { name: 'Chicken', unit: 'kg', quantity: 50, minThreshold: 10, maxCapacity: 100, categoryTag: 'Meat', isSynced: 0, _platform: 'nextgenos' },
      { name: 'Paneer', unit: 'kg', quantity: 30, minThreshold: 5, maxCapacity: 50, categoryTag: 'Dairy', isSynced: 0, _platform: 'nextgenos' },
      { name: 'Flour', unit: 'kg', quantity: 4, minThreshold: 15, maxCapacity: 100, categoryTag: 'Dry Goods', isSynced: 0, _platform: 'nextgenos' }, // below threshold!
      { name: 'Oil', unit: 'liters', quantity: 40, minThreshold: 10, maxCapacity: 80, categoryTag: 'Dry Goods', isSynced: 0, _platform: 'nextgenos' },
      { name: 'Potatoes', unit: 'kg', quantity: 60, minThreshold: 20, maxCapacity: 120, categoryTag: 'Produce', isSynced: 0, _platform: 'nextgenos' },
      { name: 'Rice', unit: 'kg', quantity: 80, minThreshold: 20, maxCapacity: 150, categoryTag: 'Dry Goods', isSynced: 0, _platform: 'nextgenos' },
      { name: 'Noodles', unit: 'packs', quantity: 25, minThreshold: 10, maxCapacity: 50, categoryTag: 'Dry Goods', isSynced: 0, _platform: 'nextgenos' },
      { name: 'Sugar', unit: 'kg', quantity: 12, minThreshold: 5, maxCapacity: 30, categoryTag: 'Dry Goods', isSynced: 0, _platform: 'nextgenos' },
      { name: 'Coffee', unit: 'kg', quantity: 8, minThreshold: 2, maxCapacity: 15, categoryTag: 'Beverages', isSynced: 0, _platform: 'nextgenos' },
      { name: 'Milk', unit: 'liters', quantity: 25, minThreshold: 5, maxCapacity: 50, categoryTag: 'Dairy', isSynced: 0, _platform: 'nextgenos' },
      { name: 'Cheese', unit: 'kg', quantity: 15, minThreshold: 5, maxCapacity: 30, categoryTag: 'Dairy', isSynced: 0, _platform: 'nextgenos' },
      { name: 'Veggies', unit: 'kg', quantity: 3, minThreshold: 10, maxCapacity: 40, categoryTag: 'Produce', isSynced: 0, _platform: 'nextgenos' } // below threshold!
    ];
    await db.inventory.bulkAdd(inventoryItems);
    console.log('[Seed] High-fidelity inventory seeded.');

    // ── Suppliers Seeding ────────────────────────────────────────
    const detailedSuppliers = [
      { name: 'Dairy Farm', phone: '9876543210', email: 'dairy@farm.com', category: 'Dairy', isSynced: 0, _platform: 'nextgenos', createdAt: new Date().toISOString() },
      { name: 'Meat Kings', phone: '9876543211', email: 'info@meatkings.com', category: 'Meat', isSynced: 0, _platform: 'nextgenos', createdAt: new Date().toISOString() },
      { name: 'Green Grocery', phone: '9876543212', email: 'order@greengrocery.com', category: 'Produce', isSynced: 0, _platform: 'nextgenos', createdAt: new Date().toISOString() },
      { name: 'Dry Bulk Co', phone: '9876543213', email: 'sales@drybulk.com', category: 'Dry Goods', isSynced: 0, _platform: 'nextgenos', createdAt: new Date().toISOString() }
    ];
    await db.suppliers.bulkAdd(detailedSuppliers);
    console.log('[Seed] High-fidelity suppliers seeded.');

    // ── CRM Customers Seeding ──────────────────────────────────
    const distinctCustomers = [
      { name: 'Aarav Sharma', phone: '9999911111', totalSpent: 6200, visitCount: 15, loyaltyPoints: 620, tier: 'platinum', lastVisit: new Date().toISOString(), createdAt: new Date().toISOString(), isSynced: 0, _platform: 'nextgenos' },
      { name: 'Priya Patel', phone: '9999922222', totalSpent: 3500, visitCount: 8, loyaltyPoints: 350, tier: 'gold', lastVisit: new Date().toISOString(), createdAt: new Date().toISOString(), isSynced: 0, _platform: 'nextgenos' },
      { name: 'Vikram Singh', phone: '9999933333', totalSpent: 1200, visitCount: 4, loyaltyPoints: 120, tier: 'silver', lastVisit: new Date().toISOString(), createdAt: new Date().toISOString(), isSynced: 0, _platform: 'nextgenos' },
      { name: 'Ananya Iyer', phone: '9999944444', totalSpent: 450, visitCount: 2, loyaltyPoints: 45, tier: 'bronze', lastVisit: new Date().toISOString(), createdAt: new Date().toISOString(), isSynced: 0, _platform: 'nextgenos' },
      { name: 'Kabir Mehta', phone: '9999955555', totalSpent: 7500, visitCount: 18, loyaltyPoints: 750, tier: 'platinum', lastVisit: new Date().toISOString(), createdAt: new Date().toISOString(), isSynced: 0, _platform: 'nextgenos' },
      { name: 'Neha Gupta', phone: '9999966666', totalSpent: 2800, visitCount: 7, loyaltyPoints: 280, tier: 'gold', lastVisit: new Date().toISOString(), createdAt: new Date().toISOString(), isSynced: 0, _platform: 'nextgenos' },
      { name: 'Rahul Verma', phone: '9999977777', totalSpent: 850, visitCount: 3, loyaltyPoints: 85, tier: 'silver', lastVisit: new Date().toISOString(), createdAt: new Date().toISOString(), isSynced: 0, _platform: 'nextgenos' },
      { name: 'Riya Sen', phone: '9999988888', totalSpent: 150, visitCount: 1, loyaltyPoints: 15, tier: 'bronze', lastVisit: new Date().toISOString(), createdAt: new Date().toISOString(), isSynced: 0, _platform: 'nextgenos' }
    ];
    await db.customers.bulkAdd(distinctCustomers);
    console.log('[Seed] High-fidelity customers seeded.');

    // ── Historical Orders Seeding ────────────────────────────────
    const historicalOrders = [];
    const orderItemsPool = [
      { name: 'Steamed Veg Momos', price: 80, isVeg: 1 },
      { name: 'Veg Hakka Noodles', price: 120, isVeg: 1 },
      { name: 'Chicken Hakka Noodles', price: 160, isVeg: 0 },
      { name: 'French Fries', price: 80, isVeg: 1 },
      { name: 'Cold Coffee', price: 80, isVeg: 1 },
      { name: 'Chilli Paneer Dry', price: 160, isVeg: 1 },
      { name: 'Chilli Chicken Dry', price: 180, isVeg: 0 },
      { name: 'Veg Fried Rice', price: 120, isVeg: 1 },
      { name: 'Classic Veg Burger', price: 80, isVeg: 1 },
      { name: 'Chocolate Lava Cake', price: 150, isVeg: 1 }
    ];

    const customersPool = [
      { name: 'Aarav Sharma', phone: '9999911111' },
      { name: 'Priya Patel', phone: '9999922222' },
      { name: 'Vikram Singh', phone: '9999933333' },
      { name: 'Ananya Iyer', phone: '9999944444' },
      { name: 'Kabir Mehta', phone: '9999955555' },
      { name: 'Neha Gupta', phone: '9999966666' },
      { name: 'Rahul Verma', phone: '9999977777' },
      { name: 'Riya Sen', phone: '9999988888' },
      { name: 'Walk-in Customer', phone: '' },
      { name: 'Walk-in Customer', phone: '' }
    ];

    const typesPool = ['takeaway', 'dinein', 'delivery'];
    const paymentsPool = ['upi', 'cash'];

    for (let i = 1; i <= 25; i++) {
      const dayDiff = Math.floor((i - 1) / 3.5);
      const orderDate = new Date();
      orderDate.setDate(orderDate.getDate() - dayDiff);
      const hour = 11 + (i % 11);
      const minute = (i * 17) % 60;
      orderDate.setHours(hour, minute, 0, 0);

      const createdAt = orderDate.toISOString();
      const completedAt = new Date(orderDate.getTime() + (10 * 60 * 1000) + ((i * 3) % 20) * 60 * 1000).toISOString();

      const cartItems = [];
      const numItems = 1 + (i % 3);
      let subtotal = 0;

      for (let j = 0; j < numItems; j++) {
        const poolIndex = (i + j * 3) % orderItemsPool.length;
        const item = orderItemsPool[poolIndex];
        const quantity = 1 + ((i + j) % 2);
        cartItems.push({
          itemId: poolIndex + 1,
          itemName: item.name,
          price: item.price,
          quantity,
          isVeg: item.isVeg,
          notes: ''
        });
        subtotal += item.price * quantity;
      }

      const gstPercent = 5;
      const tax = subtotal * (gstPercent / 100);
      const total = subtotal + tax;

      const customer = customersPool[i % customersPool.length];
      const type = typesPool[i % typesPool.length];
      const paymentMethod = paymentsPool[i % paymentsPool.length];

      const orderNumber = `TT-${orderDate.getFullYear()}${String(orderDate.getMonth() + 1).padStart(2, '0')}${String(orderDate.getDate()).padStart(2, '0')}-${String(i).padStart(3, '0')}`;
      const clientOrderId = generateLocalUuid();

      historicalOrders.push({
        clientOrderId,
        idempotencyKey: clientOrderId,
        orderNumber,
        displayToken: getDisplayToken(orderNumber, clientOrderId),
        type,
        channel: 'pos',
        source: 'pos',
        status: 'completed',
        items: JSON.stringify(cartItems),
        subtotal,
        tax,
        taxPercent: gstPercent,
        total,
        paymentMethod,
        paymentStatus: 'paid',
        customerName: customer.name,
        customerPhone: customer.phone,
        validationStatus: 'trusted_staff',
        requiresServerValidation: false,
        syncStatus: 'pending',
        syncAttempts: 0,
        staffId: 1,
        staffName: 'Owner',
        tableId: type === 'dinein' ? (1 + (i % 8)) : null,
        createdAt,
        completedAt,
        isSynced: 0
      });
    }

    await db.orders.bulkAdd(historicalOrders);
    console.log('[Seed] High-fidelity historical orders seeded.');
  });
}

/**
 * Run local compatibility cleanup and dynamic setting migrations.
 * Extracted so it can be called from both cloud-first and normal seed paths.
 */
async function runMigrations() {
  try {
    await db.settings.bulkDelete(['adminPin', 'adminPinHash', 'requirePinForOrder']);
    const staffMembers = await db.staff.toArray();
    for (const staff of staffMembers) {
      if (staff.pin || staff.pinHash) {
        await db.staff.update(staff.id, { pin: undefined, pinHash: undefined });
      }
    }

    // Dynamic UPI ID Migration
    const currentUpiIdSetting = await db.settings.get('upiId');
    if (!currentUpiIdSetting || currentUpiIdSetting.value === 'thetaste@upi' || currentUpiIdSetting.value === '') {
      await db.settings.put({ key: 'upiId', value: '' });
    }

    // Dynamic Store Details Migration
    const phoneSetting = await db.settings.get('restaurantPhone');
    if (!phoneSetting || phoneSetting.value === '') {
      await db.settings.put({ key: 'restaurantPhone', value: '' });
    }
    const addressSetting = await db.settings.get('restaurantAddress');
    if (!addressSetting || addressSetting.value === '' || addressSetting.value.includes('Kolkata')) {
      await db.settings.put({ key: 'restaurantAddress', value: 'Sandalpur Road, Kumhrar, Patna, Bihar' });
      console.log('[Seed] Restaurant address successfully updated.');
    }
    const taglineSetting = await db.settings.get('restaurantTagline');
    if (!taglineSetting || taglineSetting.value === 'Fast Food & Chinese') {
      await db.settings.put({ key: 'restaurantTagline', value: 'Chinese Food — Fresh & Reasonable' });
      console.log('[Seed] Restaurant tagline successfully updated.');
    }
  } catch (err) {
    console.error('[Seed] Failed to run migrations:', err);
  }
}

async function ensureDefaultTables() {
  try {
    const tableStore = db.table('tables');
    const tableCount = await tableStore.count();
    if (tableCount === 0) {
      const defaultTables = [
        { number: 1, status: 'available', floorSection: 'Main Hall' },
        { number: 2, status: 'available', floorSection: 'Main Hall' },
        { number: 3, status: 'available', floorSection: 'Main Hall' },
        { number: 4, status: 'available', floorSection: 'Main Hall' },
        { number: 5, status: 'available', floorSection: 'Window Side' },
        { number: 6, status: 'available', floorSection: 'Window Side' },
        { number: 7, status: 'available', floorSection: 'Balcony' },
        { number: 8, status: 'available', floorSection: 'Balcony' }
      ];
      await tableStore.bulkAdd(defaultTables);
      console.log('[Seed] Default tables seeded.');
    }
  } catch (err) {
    console.error('[Seed] Failed to seed default tables:', err);
  }
}
