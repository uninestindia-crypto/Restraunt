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
  if (args.length < 5) {
    console.log('Usage: node scripts/create-product-with-image.js "<name>" "<price>" "<category_id>" "<image_filepath>" "<id>"');
    process.exit(1);
  }

  const name = args[0];
  const price = parseFloat(args[1]);
  const categoryId = parseInt(args[2]);
  const imageSource = args[3];
  const customId = parseInt(args[4]);

  console.log(`Checking if item "${name}" already exists...`);
  const { data: existing, error: fetchErr } = await supabase
    .from('menu_items')
    .select('id')
    .ilike('name', name);

  if (fetchErr) {
    console.error('Error checking item:', fetchErr);
    process.exit(1);
  }

  if (existing && existing.length > 0) {
    console.log(`Item "${name}" already exists with ID: ${existing[0].id}. Please run the update script instead.`);
    process.exit(1);
  }

  let finalImageUrl = '';

  if (fs.existsSync(imageSource)) {
    console.log(`Local file detected: ${imageSource}. Uploading to Supabase Storage...`);
    const fileBuffer = fs.readFileSync(imageSource);
    const fileExt = path.extname(imageSource);
    const fileName = `${customId}_${Date.now()}${fileExt}`;

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
  } else {
    console.error('Local image file not found at path:', imageSource);
    process.exit(1);
  }

  console.log(`Inserting new menu item "${name}" into Supabase...`);
  const { data: insertData, error: insertErr } = await supabase
    .from('menu_items')
    .insert({
      id: customId,
      store_id: 'the-taste',
      category_id: categoryId,
      name: name,
      price: price,
      is_available: true,
      is_veg: true,
      sort_order: 2,
      image_url: finalImageUrl
    })
    .select();

  if (insertErr) {
    console.error('Failed to insert menu item:', insertErr);
    process.exit(1);
  }

  console.log(`Successfully created "${name}" with ID: ${customId}!`);
  console.table(insertData);
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
