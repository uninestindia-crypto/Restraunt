/**
 * Bake the live menu into the build.
 *
 * The storefront is a statically exported SPA, so without this step the HTML a
 * crawler receives contains no dish names and no prices — the menu only exists
 * after the client boots and reads IndexedDB. This script pulls the published
 * catalogue at build time and writes it where the server components can import
 * it, plus the sitemap for the static marketing routes.
 *
 * It must never fail the build: a missing key or an unreachable Supabase falls
 * back to the previously committed snapshot, and then to an empty one.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const root = process.cwd();
const snapshotPath = path.join(root, 'src', 'data', 'menu-snapshot.json');
const sitemapPath = path.join(root, 'public', 'sitemap.xml');

/** Kept in step with STATIC_ROUTES in src/content/storefront.ts (asserted by tests). */
const STATIC_ROUTES = [
  { path: '/', priority: '1.0', changefreq: 'daily' },
  { path: '/menu', priority: '0.9', changefreq: 'daily' },
  { path: '/offers', priority: '0.8', changefreq: 'weekly' },
  { path: '/about', priority: '0.6', changefreq: 'monthly' },
  { path: '/catering', priority: '0.6', changefreq: 'monthly' },
  { path: '/support', priority: '0.5', changefreq: 'monthly' }
];

const STORE_ORIGIN = process.env.NEXT_PUBLIC_STORE_ORIGIN || 'https://thetaste.in';
const STORE_ID = process.env.NEXT_PUBLIC_STORE_ID || 'the-taste';

function readEnvFile() {
  const envPath = path.join(root, '.env');
  if (!fs.existsSync(envPath)) return {};
  const parsed = {};
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (!match) continue;
    let value = (match[2] || '').trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    parsed[match[1]] = value;
  }
  return parsed;
}

function resolveCredentials() {
  const fileEnv = readEnvFile();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || fileEnv.NEXT_PUBLIC_SUPABASE_URL || '';
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    fileEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    fileEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    '';
  return { url: url.trim(), key: key.trim() };
}

function readExistingSnapshot() {
  try {
    const parsed = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
    return Array.isArray(parsed?.categories) ? parsed : null;
  } catch {
    return null;
  }
}

/** Only published, orderable rows belong in a page that promises availability. */
function buildSnapshot(categories, items) {
  const itemsByCategory = new Map();
  for (const item of items) {
    if (item.is_available === false) continue;
    const list = itemsByCategory.get(item.category_id) || [];
    list.push({
      id: item.id,
      name: String(item.name || '').trim(),
      price: Number(item.price) || 0,
      isVeg: item.is_veg === true,
      imageUrl: String(item.image_url || '').trim()
    });
    itemsByCategory.set(item.category_id, list);
  }

  return categories
    .filter(category => category.is_active !== false)
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
    .map(category => ({
      id: category.id,
      name: String(category.name || '').trim(),
      icon: String(category.icon || '').trim(),
      items: (itemsByCategory.get(category.id) || []).sort((a, b) => a.name.localeCompare(b.name))
    }))
    .filter(category => category.name && category.items.length > 0);
}

function writeSitemap() {
  const lastmod = new Date().toISOString().slice(0, 10);
  const urls = STATIC_ROUTES.map(
    route => `  <url>
    <loc>${STORE_ORIGIN}${route.path}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${route.changefreq}</changefreq>
    <priority>${route.priority}</priority>
  </url>`
  ).join('\n');

  fs.writeFileSync(
    sitemapPath,
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
    'utf8'
  );
  console.log(`[menu-snapshot] Wrote sitemap with ${STATIC_ROUTES.length} routes.`);
}

async function fetchCatalogue() {
  const { url, key } = resolveCredentials();
  if (!url || !key) {
    console.warn('[menu-snapshot] Supabase credentials absent; keeping the committed snapshot.');
    return null;
  }

  const client = createClient(url, key, { auth: { persistSession: false } });
  const [categoryResult, itemResult] = await Promise.all([
    client.from('menu_categories').select('id, name, icon, sort_order, is_active').eq('store_id', STORE_ID),
    client
      .from('menu_items')
      .select('id, category_id, name, price, is_veg, is_available, image_url')
      .eq('store_id', STORE_ID)
  ]);

  if (categoryResult.error) throw categoryResult.error;
  if (itemResult.error) throw itemResult.error;
  if (!categoryResult.data?.length || !itemResult.data?.length) {
    console.warn('[menu-snapshot] Cloud catalogue is empty; keeping the committed snapshot.');
    return null;
  }

  return buildSnapshot(categoryResult.data, itemResult.data);
}

async function run() {
  fs.mkdirSync(path.dirname(snapshotPath), { recursive: true });
  writeSitemap();

  const existing = readExistingSnapshot();
  let categories = null;

  try {
    categories = await fetchCatalogue();
  } catch (error) {
    console.warn(`[menu-snapshot] Catalogue fetch failed (${error?.message || error}); keeping the committed snapshot.`);
  }

  if (!categories && existing) {
    console.log(`[menu-snapshot] Reusing snapshot from ${existing.generatedAt} (${existing.categories.length} categories).`);
    return;
  }

  const snapshot = {
    generatedAt: new Date().toISOString(),
    storeId: STORE_ID,
    source: categories ? 'cloud' : 'empty',
    categories: categories || []
  };

  fs.writeFileSync(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  const itemCount = snapshot.categories.reduce((sum, category) => sum + category.items.length, 0);
  console.log(`[menu-snapshot] Wrote ${snapshot.categories.length} categories / ${itemCount} items (source: ${snapshot.source}).`);
}

run().catch(error => {
  // A snapshot failure degrades SEO; it must never break a deploy.
  console.error('[menu-snapshot] Unexpected failure:', error);
  process.exit(0);
});
