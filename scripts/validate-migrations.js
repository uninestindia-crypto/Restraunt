import fs from 'fs';
import path from 'path';
import { loadModule, parseSync } from 'pgsql-parser';

const migrationsDir = path.resolve(process.cwd(), 'supabase', 'migrations');
const files = fs.readdirSync(migrationsDir)
  .filter(filename => filename.endsWith('.sql'))
  .sort();

if (!files.length) {
  throw new Error('No Supabase migrations found.');
}

await loadModule();

for (const filename of files) {
  const sql = fs.readFileSync(path.join(migrationsDir, filename), 'utf8');
  try {
    parseSync(sql);
  } catch (error) {
    console.error(`[database] Failed to parse ${filename}`);
    throw error;
  }
}

console.log(`[database] Parsed ${files.length} migrations in deterministic order.`);
