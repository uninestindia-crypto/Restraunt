import fs from 'fs';
import path from 'path';
import pkg from 'pg';
const { Client } = pkg;

const sqlPath = path.resolve('./supabase-schema.sql');

if (!fs.existsSync(sqlPath)) {
  console.error(`Error: SQL file not found at ${sqlPath}`);
  process.exit(1);
}

const sql = fs.readFileSync(sqlPath, 'utf8');

async function main() {
  // Use IPv4 regional pooler host with postgres.[project-ref] format
  const client = new Client({
    user: 'postgres.scxfkjtrrfgpusyigntx',
    host: 'aws-0-ap-south-1.pooler.supabase.com',
    database: 'postgres',
    password: '5968474644jJ@',
    port: 5432, // Session mode pooler supporting IPv4
    ssl: { rejectUnauthorized: false }
  });

  console.log('Connecting to Supabase PostgreSQL database via IPv4 Mumbai regional pooler...');
  await client.connect();
  console.log('Connected! Executing DDL schema...');

  try {
    await client.query(sql);
    console.log('✅ Supabase Schema applied successfully with Row-Level Security, compound indexes, store isolation, and Realtime replication! 🎉');
  } catch (error) {
    console.error('❌ Failed to execute SQL schema statements:', error);
  } finally {
    await client.end();
  }
}

main().catch(console.error);
