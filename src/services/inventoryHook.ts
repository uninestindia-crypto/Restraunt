/**
 * ═══════════════════════════════════════════════════
 *  NextGenOS Restaurant Operating System
 *  Module: Inventory Hook – Auto-Deduction
 *  Version: 2.0.0
 *  © 2026 NextGenOS. All Rights Reserved.
 *  This software is proprietary and confidential.
 * ═══════════════════════════════════════════════════
 */

import { db } from '../db/database';

/**
 * Normalise a string for fuzzy comparison.
 * Lowercases, trims, and strips extra whitespace.
 * @param {string} str
 * @returns {string}
 */
function normalise(str) {
  return (str || '').toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Check whether two names match fuzzily.
 * Returns true when either string contains the other.
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function fuzzyMatch(a, b) {
  const na = normalise(a);
  const nb = normalise(b);
  if (!na || !nb) return false;
  return na.includes(nb) || nb.includes(na);
}

/**
 * Deduct inventory for every item in an order.
 *
 * For each order item the function:
 *  1. Looks up recipes in `db.recipes` by `menuItemId` (when the order item
 *     carries one) and deducts each ingredient listed in the recipe.
 *  2. If no recipe exists it falls back to a fuzzy name-match against
 *     `db.inventory` and deducts the order item quantity directly.
 *
 * @param {Array<{itemName: string, quantity: number, menuItemId?: number}>} orderItems
 * @returns {Promise<Array<{itemName: string, deducted: number, remaining: number, belowThreshold: boolean}>>}
 */
export async function deductInventoryForOrder(orderItems) {
  const results = [];

  if (!Array.isArray(orderItems) || orderItems.length === 0) {
    return results;
  }

  try {
    for (const orderItem of orderItems) {
      const { itemName, quantity = 1, menuItemId } = orderItem;

      // ── 1. Recipe-based deduction ───────────────────
      let recipeFound = false;

      if (menuItemId !== undefined && menuItemId !== null) {
        try {
          const recipes = await db.recipes
            .where('menuItemId')
            .equals(menuItemId)
            .toArray();

          if (recipes.length > 0) {
            recipeFound = true;

            for (const recipe of recipes) {
              const ingredients = recipe.ingredients || [];

              for (const ingredient of ingredients) {
                try {
                  const invItem = await db.inventory.get(ingredient.inventoryId);

                  if (invItem) {
                    const deductAmount = (ingredient.quantity || 0) * quantity;
                    const newQuantity = Math.max(0, (invItem.quantity || 0) - deductAmount);

                    await db.inventory.update(invItem.id, { quantity: newQuantity });

                    results.push({
                      itemName: invItem.name,
                      deducted: deductAmount,
                      remaining: newQuantity,
                      belowThreshold: newQuantity <= (invItem.minThreshold || 0),
                    });
                  }
                } catch (ingredientError) {
                  console.error(
                    `[InventoryHook] Dexie database error deducting ingredient ${ingredient.inventoryId}:`,
                    ingredientError
                  );
                }
              }
            }
          }
        } catch (recipeError) {
          console.error(
            `[InventoryHook] Dexie database error looking up recipe for menuItemId ${menuItemId}:`,
            recipeError
          );
        }
      }

      // ── 2. Fuzzy name-match fallback ────────────────
      if (!recipeFound) {
        try {
          const allInventory = await db.inventory.toArray();
          const match = allInventory.find(inv => fuzzyMatch(inv.name, itemName));

          if (match) {
            const deductAmount = quantity;
            const newQuantity = Math.max(0, (match.quantity || 0) - deductAmount);

            await db.inventory.update(match.id, { quantity: newQuantity });

            results.push({
              itemName: match.name,
              deducted: deductAmount,
              remaining: newQuantity,
              belowThreshold: newQuantity <= (match.minThreshold || 0),
            });
          } else {
            // No inventory record found – log but do not error
            console.warn(
              `[InventoryHook] No inventory match found for "${itemName}". Skipping deduction.`
            );
          }
        } catch (fuzzyError) {
          console.error(
            `[InventoryHook] Dexie database error during fuzzy match for "${itemName}":`,
            fuzzyError
          );
        }
      }
    }
  } catch (error) {
    console.error('[InventoryHook] Dexie database error in deductInventoryForOrder:', error);
  }

  return results;
}

/**
 * Retrieve all inventory items whose current quantity is at or below the
 * configured minimum threshold.
 *
 * @returns {Promise<Array<Object>>} Low-stock inventory records
 */
export async function checkLowStock() {
  try {
    const items = await db.inventory.toArray();
    return items.filter(item => item.quantity <= (item.minThreshold || 0));
  } catch (error) {
    console.error('[InventoryHook] Dexie database error in checkLowStock:', error);
    return [];
  }
}

/**
 * Build human-readable alert strings for every low-stock inventory item.
 *
 * @returns {Promise<Array<string>>} Formatted alert messages
 */
export async function getStockAlerts() {
  try {
    const lowStockItems = await checkLowStock();

    return lowStockItems.map(item => {
      const qty = item.quantity ?? 0;
      const unit = item.unit || 'units';
      const threshold = item.minThreshold ?? 0;

      if (qty === 0) {
        return `⛔ OUT OF STOCK: ${item.name} – replenish immediately!`;
      }

      return `⚠️ LOW STOCK: ${item.name} – ${qty} ${unit} remaining (threshold: ${threshold} ${unit})`;
    });
  } catch (error) {
    console.error('[InventoryHook] Dexie database error in getStockAlerts:', error);
    return [];
  }
}
