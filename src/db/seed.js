import { db } from './database.js';
import { hashPin } from '../utils/crypto.js';

/**
 * Seeds the database with initial data if empty.
 * Checks for existing categories before seeding.
 */
export async function seedDatabase() {
  // Migrate existing staff/admin credentials. New installs use the owner setup wizard.
  try {
    const staffCount = await db.staff.count();
    if (staffCount > 0) {
      const staffMembers = await db.staff.toArray();
      for (const staff of staffMembers) {
        if (staff.pin && !staff.pinHash) {
          await db.staff.update(staff.id, {
            pinHash: await hashPin(staff.pin),
            pin: undefined,
            isSynced: 0
          });
        }
      }
    }

    const legacyAdminPin = await db.settings.get('adminPin');
    const adminPinHash = await db.settings.get('adminPinHash');
    if (legacyAdminPin?.value && !adminPinHash?.value && legacyAdminPin.value !== '1234') {
      await db.settings.put({ key: 'adminPinHash', value: await hashPin(legacyAdminPin.value) });
      await db.settings.delete('adminPin');
    }
  } catch (err) {
    console.error('[Seed] Failed to migrate staff credentials:', err);
  }

  // Ensure default tables exist
  try {
    const tableCount = await db.tables.count();
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
      await db.tables.bulkAdd(defaultTables);
      console.log('[Seed] Default tables seeded.');
    }
  } catch (err) {
    console.error('[Seed] Failed to seed default tables:', err);
  }

  const existingCategories = await db.menuCategories.count();
  if (existingCategories > 0) {
    return; // Data already exists
  }

  await db.transaction('rw', db.menuCategories, db.menuItems, db.settings, db.inventory, db.suppliers, db.customers, db.orders, async () => {
    // ── Categories ──────────────────────────────────────────────
    const categories = [
      { name: 'Momos', icon: '🥟', sortOrder: 1, isActive: 1, isSynced: 0 },
      { name: 'Starters', icon: '🥢', sortOrder: 2, isActive: 1, isSynced: 0 },
      { name: 'Noodles', icon: '🍜', sortOrder: 3, isActive: 1, isSynced: 0 },
      { name: 'Rice', icon: '🍚', sortOrder: 4, isActive: 1, isSynced: 0 },
      { name: 'Main Course', icon: '🍛', sortOrder: 5, isActive: 1, isSynced: 0 },
      { name: 'Burgers', icon: '🍔', sortOrder: 6, isActive: 1, isSynced: 0 },
      { name: 'Sides', icon: '🍟', sortOrder: 7, isActive: 1, isSynced: 0 },
      { name: 'Beverages', icon: '🥤', sortOrder: 8, isActive: 1, isSynced: 0 },
      { name: 'Desserts', icon: '🍨', sortOrder: 9, isActive: 1, isSynced: 0 },
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

    // Momos
    addItem('Momos', 'Steamed Veg Momos', 80, true);
    addItem('Momos', 'Fried Veg Momos', 100, true);
    addItem('Momos', 'Steamed Chicken Momos', 120, false);
    addItem('Momos', 'Fried Chicken Momos', 140, false);
    addItem('Momos', 'Paneer Momos', 120, true);
    addItem('Momos', 'Tandoori Momos (Chicken)', 150, false);
    addItem('Momos', 'Afghani Momos', 160, false);
    addItem('Momos', 'Kurkure Momos', 130, true);

    // Starters
    addItem('Starters', 'Veg Spring Rolls (4pc)', 120, true);
    addItem('Starters', 'Chilli Paneer Dry', 160, true);
    addItem('Starters', 'Honey Chilli Potato', 140, true);
    addItem('Starters', 'Crispy Corn', 120, true);
    addItem('Starters', 'Manchurian Dry', 140, true);
    addItem('Starters', 'Chicken 65', 180, false);
    addItem('Starters', 'Chilli Chicken Dry', 180, false);
    addItem('Starters', 'Dragon Chicken', 200, false);

    // Noodles
    addItem('Noodles', 'Veg Hakka Noodles', 120, true);
    addItem('Noodles', 'Chicken Hakka Noodles', 160, false);
    addItem('Noodles', 'Veg Schezwan Noodles', 140, true);
    addItem('Noodles', 'Chow Mein', 100, true);
    addItem('Noodles', 'Singapore Noodles', 150, true);
    addItem('Noodles', 'Triple Schezwan Noodles', 180, true);

    // Rice
    addItem('Rice', 'Veg Fried Rice', 120, true);
    addItem('Rice', 'Chicken Fried Rice', 160, false);
    addItem('Rice', 'Schezwan Fried Rice', 140, true);
    addItem('Rice', 'Triple Schezwan Rice', 170, true);
    addItem('Rice', 'Egg Fried Rice', 130, false);

    // Main Course
    addItem('Main Course', 'Manchurian Gravy', 160, true);
    addItem('Main Course', 'Chilli Paneer Gravy', 180, true);
    addItem('Main Course', 'Sweet Corn Soup', 100, true);
    addItem('Main Course', 'Hot & Sour Soup', 100, true);
    addItem('Main Course', 'Manchow Soup', 120, true);
    addItem('Main Course', 'Chicken Manchow Soup', 140, false);

    // Burgers
    addItem('Burgers', 'Classic Veg Burger', 80, true);
    addItem('Burgers', 'Aloo Tikki Burger', 90, true);
    addItem('Burgers', 'Paneer Burger', 110, true);
    addItem('Burgers', 'Chicken Burger', 120, false);
    addItem('Burgers', 'Chicken Zinger', 150, false);
    addItem('Burgers', 'Paneer Wrap', 100, true);
    addItem('Burgers', 'Chicken Wrap', 130, false);

    // Sides
    addItem('Sides', 'French Fries', 80, true);
    addItem('Sides', 'Peri Peri Fries', 100, true);
    addItem('Sides', 'Loaded Cheese Fries', 140, true);
    addItem('Sides', 'Garlic Bread (4pc)', 100, true);
    addItem('Sides', 'Cheese Garlic Bread', 130, true);

    // Beverages
    addItem('Beverages', 'Cold Coffee', 80, true);
    addItem('Beverages', 'Lemon Iced Tea', 60, true);
    addItem('Beverages', 'Mango Shake', 90, true);
    addItem('Beverages', 'Oreo Shake', 100, true);
    addItem('Beverages', 'Coca Cola (300ml)', 40, true);
    addItem('Beverages', 'Sprite (300ml)', 40, true);
    addItem('Beverages', 'Thumbs Up (300ml)', 40, true);
    addItem('Beverages', 'Water Bottle', 20, true);
    addItem('Beverages', 'Masala Chai', 20, true);

    // Desserts
    addItem('Desserts', 'Brownie with Ice Cream', 120, true);
    addItem('Desserts', 'Gulab Jamun (2pc)', 60, true);
    addItem('Desserts', 'Chocolate Lava Cake', 150, true);

    await db.menuItems.bulkAdd(menuItems);

    // ── Default Settings ────────────────────────────────────────
    const defaultSettings = [
      { key: 'restaurantName', value: 'The Taste' },
      { key: 'restaurantTagline', value: 'Fast Food & Chinese' },
      { key: 'restaurantPhone', value: '' },
      { key: 'restaurantAddress', value: '' },
      { key: 'upiId', value: 'thetaste@upi' },
      { key: 'upiName', value: 'The Taste' },
      { key: 'gstPercent', value: '5' },
      { key: 'printerWidth', value: '58' },
      { key: 'orderNumberPrefix', value: 'TT' },
    ];

    await db.settings.bulkAdd(defaultSettings);

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

      historicalOrders.push({
        orderNumber,
        type,
        channel: 'pos',
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
