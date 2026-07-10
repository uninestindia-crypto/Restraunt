import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Parse .env manually
const envPath = path.resolve('d:\\Zeaul\\Restraunt\\.env');
const envContent = fs.readFileSync(envPath, 'utf-8');
const envVars = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    const key = match[1];
    let value = match[2] || '';
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    } else if (value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1);
    }
    envVars[key] = value.trim();
  }
});

const url = envVars.NEXT_PUBLIC_SUPABASE_URL || 'https://scxfkjtrrfgpusyigntx.supabase.co';
const serviceRoleKey = envVars.SUPABASE_SERVICE_ROLE_KEY;

if (!serviceRoleKey) {
  console.error('No service role key found in .env');
  process.exit(1);
}

const supabase = createClient(url, serviceRoleKey);

async function run() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.log('Usage: node scripts/update-product-image.js "<menu_item_name>" "<image_url_or_filepath>"');
    process.exit(1);
  }

  const itemName = args[0];
  const imageSource = args[1];

  console.log(`Searching for menu item matching "${itemName}"...`);
  const { data: items, error: fetchErr } = await supabase
    .from('menu_items')
    .select('id, name, image_url')
    .ilike('name', itemName);

  if (fetchErr) {
    console.error('Error fetching menu item:', fetchErr);
    process.exit(1);
  }

  if (!items || items.length === 0) {
    console.error(`No menu items found matching "${itemName}".`);
    process.exit(1);
  }

  const item = items[0];
  console.log(`Found item: ${item.name} (ID: ${item.id})`);

  let finalImageUrl = imageSource;

  // Check if imageSource is a local file
  if (fs.existsSync(imageSource)) {
    console.log(`Local file detected: ${imageSource}. Uploading to Supabase Storage...`);
    const fileBuffer = fs.readFileSync(imageSource);
    const fileExt = path.extname(imageSource);
    const fileName = `${item.id}_${Date.now()}${fileExt}`;

    const { data: uploadData, error: uploadErr } = await supabase.storage
      .from('menu-images')
      .upload(fileName, fileBuffer, {
        contentType: getContentType(fileExt),
        upsert: true
      });

    if (uploadErr) {
      console.error('Failed to upload image:', uploadErr);
      process.exit(1);
    }

    console.log('Upload successful! Retrieve public URL...');
    const { data: urlData } = supabase.storage
      .from('menu-images')
      .getPublicUrl(fileName);

    finalImageUrl = urlData.publicUrl;
  }

  console.log(`Updating image URL for "${item.name}" to: ${finalImageUrl}`);
  const { data: updateData, error: updateErr } = await supabase
    .from('menu_items')
    .update({ image_url: finalImageUrl })
    .eq('id', item.id)
    .select();

  if (updateErr) {
    console.error('Failed to update menu item:', updateErr);
    process.exit(1);
  }

  console.log(`Successfully updated ${item.name}!`);
  console.table(updateData);
}

function getContentType(ext) {
  switch (ext.toLowerCase()) {
    case '.png': return 'image/png';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.webp': return 'image/webp';
    case '.gif': return 'image/gif';
    default: return 'application/octet-stream';
  }
}

run();
