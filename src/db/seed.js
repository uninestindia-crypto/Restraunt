import { db } from './database.js';

/**
 * Seeds the database with initial data if empty.
 * Checks for existing categories before seeding.
 */
export async function seedDatabase() {
  // Ensure default staff exists
  try {
    const staffCount = await db.staff.count();
    if (staffCount === 0) {
      await db.staff.add({
        name: 'Owner',
        role: 'owner',
        pin: '1234',
        isActive: 1,
        createdAt: new Date().toISOString(),
        isSynced: 0,
        _platform: 'nextgenos'
      });
      console.log('[Seed] Default owner staff seeded.');
    }
  } catch (err) {
    console.error('[Seed] Failed to seed default staff:', err);
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

  await db.transaction('rw', db.menuCategories, db.menuItems, db.settings, async () => {
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
      { key: 'adminPin', value: '1234' },
      { key: 'orderNumberPrefix', value: 'TT' },
    ];

    await db.settings.bulkAdd(defaultSettings);
  });
}
