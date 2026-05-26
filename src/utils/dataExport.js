/**
 * ═══════════════════════════════════════════════════
 *  NextGenOS Restaurant Operating System
 *  Module: Data Export & Backup Utilities
 *  Version: 2.0.0
 *  © 2026 NextGenOS. All Rights Reserved.
 *  This software is proprietary and confidential.
 * ═══════════════════════════════════════════════════
 */

import { db } from '../db/database.js';

// ── Table names used for export / import ─────────
const TABLE_NAMES = [
  'menuCategories',
  'menuItems',
  'orders',
  'customers',
  'staff',
  'inventory',
  'suppliers',
  'tables',
  'settings',
];

/**
 * Create a Blob from content and trigger a browser download.
 * @param {string} content  - File body (text / JSON / CSV)
 * @param {string} filename - Suggested file name
 * @param {string} mimeType - MIME type for the Blob
 */
export function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';

  document.body.appendChild(anchor);
  anchor.click();

  // Clean up
  setTimeout(() => {
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }, 100);
}

/**
 * Export every supported table into a single JSON file and download it.
 * @returns {Promise<Object>} The exported data object (including metadata)
 */
export async function exportAllData() {
  try {
    const data = {
      metadata: {
        exportDate: new Date().toISOString(),
        platform: 'NextGenOS',
        version: '2.0.0',
      },
    };

    for (const table of TABLE_NAMES) {
      if (db[table]) {
        data[table] = await db[table].toArray();
      } else {
        data[table] = [];
      }
    }

    const json = JSON.stringify(data, null, 2);
    const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    downloadFile(json, `nextgenos-backup-${timestamp}.json`, 'application/json');

    console.log('[DataExport] Full backup exported successfully.');
    return data;
  } catch (error) {
    console.error('[DataExport] Failed to export all data:', error);
    throw error;
  }
}

/**
 * Export recent orders as a CSV file.
 * @param {number} daysBack - Number of days to look back (default 30)
 */
export async function exportOrdersCSV(daysBack = 30) {
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysBack);
    const cutoffISO = cutoff.toISOString();

    const orders = await db.orders
      .where('createdAt')
      .above(cutoffISO)
      .toArray();

    // Sort newest-first
    orders.sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    const columns = [
      'orderNumber',
      'type',
      'status',
      'paymentMethod',
      'total',
      'itemCount',
      'createdAt',
    ];

    const header = columns.join(',');

    const rows = orders.map(order => {
      const itemCount = Array.isArray(order.items) ? order.items.length : 0;
      return [
        escapeCsvField(order.orderNumber ?? ''),
        escapeCsvField(order.type ?? ''),
        escapeCsvField(order.status ?? ''),
        escapeCsvField(order.paymentMethod ?? ''),
        order.total ?? 0,
        itemCount,
        escapeCsvField(order.createdAt ?? ''),
      ].join(',');
    });

    const csv = [header, ...rows].join('\n');
    const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    downloadFile(csv, `orders-export-${timestamp}.csv`, 'text/csv');

    console.log(`[DataExport] Exported ${orders.length} orders to CSV (last ${daysBack} days).`);
  } catch (error) {
    console.error('[DataExport] Failed to export orders CSV:', error);
    throw error;
  }
}

/**
 * Import data from a JSON string previously exported by exportAllData().
 * Uses a single Dexie transaction so the import is atomic.
 * @param {string} jsonString - Raw JSON string
 * @returns {Promise<Object>} { success: true, counts: { orders: N, … } }
 */
export async function importData(jsonString) {
  let parsed;

  try {
    parsed = JSON.parse(jsonString);
  } catch (err) {
    throw new Error('Invalid JSON: unable to parse the provided string.');
  }

  // Validate structure – must contain metadata and at least one table
  if (!parsed || !parsed.metadata || !parsed.metadata.platform) {
    throw new Error('Invalid backup file: missing metadata block.');
  }

  const validTables = TABLE_NAMES.filter(
    name => Array.isArray(parsed[name]) && parsed[name].length > 0
  );

  if (validTables.length === 0) {
    throw new Error('Backup file contains no importable data.');
  }

  // Resolve Dexie table references
  const tableRefs = validTables.map(name => db[name]);

  const counts = {};

  try {
    await db.transaction('rw', tableRefs, async () => {
      for (const name of validTables) {
        const records = parsed[name];
        await db[name].bulkPut(records);
        counts[name] = records.length;
      }
    });
  } catch (error) {
    console.error('[DataExport] Import transaction failed:', error);
    throw error;
  }

  console.log('[DataExport] Data imported successfully:', counts);
  return { success: true, counts };
}

// ── Internal helpers ─────────────────────────────

/**
 * Escape a value for safe CSV inclusion.
 * @param {string|number} value
 * @returns {string}
 */
function escapeCsvField(value) {
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}
