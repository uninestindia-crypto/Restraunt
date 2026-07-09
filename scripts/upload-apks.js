// scripts/upload-apks.js
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { loadEnv } from './provision-admin.js';

async function main() {
  const env = loadEnv();
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    console.error('Error: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false }
  });

  console.log('Connecting to Supabase Storage...');
  
  // 1. Ensure the bucket 'apks' exists and is public
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  if (listError) throw listError;

  const bucketName = 'apks';
  const bucketExists = buckets.some(b => b.name === bucketName);

  if (!bucketExists) {
    console.log(`Creating public bucket '${bucketName}'...`);
    const { error: createError } = await supabase.storage.createBucket(bucketName, {
      public: true,
      fileSizeLimit: 50 * 1024 * 1024 // 50MB limit
    });
    if (createError) throw createError;
    console.log(`Bucket '${bucketName}' created successfully.`);
  } else {
    console.log(`Bucket '${bucketName}' already exists.`);
  }

  // 2. Upload both APK files
  const apks = [
    { localPath: 'TheTastePOS.apk', storagePath: 'TheTastePOS.apk' },
    { localPath: 'TheTasteCustomer.apk', storagePath: 'TheTasteCustomer.apk' }
  ];

  for (const apk of apks) {
    const localFullPath = path.resolve(process.cwd(), apk.localPath);
    if (!fs.existsSync(localFullPath)) {
      console.warn(`Warning: Local file not found at ${localFullPath}. Skipping.`);
      continue;
    }

    console.log(`Uploading ${apk.localPath} to bucket '${bucketName}' (overwriting if exists)...`);
    const fileBuffer = fs.readFileSync(localFullPath);

    const { data, error } = await supabase.storage
      .from(bucketName)
      .upload(apk.storagePath, fileBuffer, {
        contentType: 'application/vnd.android.package-archive',
        upsert: true
      });

    if (error) {
      console.error(`Error uploading ${apk.localPath}:`, error.message);
      throw error;
    }
    console.log(`Successfully uploaded ${apk.localPath}!`);
  }

  console.log('All APK uploads completed successfully!');
}

main().catch(err => {
  console.error('Fatal error during APK upload:', err.message || err);
  process.exit(1);
});
