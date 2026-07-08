import fs from 'fs';
import path from 'path';

const DEFAULT_STORE_ID = 'the-taste';
const MAX_CHUNK_SIZE = 800; // Characters per RAG chunk

function loadEnv() {
  const vars = { ...process.env };
  const filePath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(filePath)) {
    for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*([^#=]+)\s*=\s*(.*)\s*$/);
      if (!match) continue;
      let value = match[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      vars[match[1].trim()] = value;
    }
  }
  return vars;
}

// Simple semantic chunking algorithm
function chunkText(text, maxChars = MAX_CHUNK_SIZE) {
  // Try splitting by markdown headers first, or paragraph boundaries
  const rawParagraphs = text.split(/\n{2,}/);
  const chunks = [];
  let currentChunk = '';

  for (const para of rawParagraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;

    if (trimmed.length > maxChars) {
      // Paragraph is too large, split by sentences or line breaks
      if (currentChunk) {
        chunks.push(currentChunk.trim());
        currentChunk = '';
      }
      
      const sentences = trimmed.match(/[^.!?]+[.!?]+(\s|$)/g) || [trimmed];
      let subChunk = '';
      for (const sent of sentences) {
        if ((subChunk + sent).length > maxChars) {
          if (subChunk) chunks.push(subChunk.trim());
          subChunk = sent;
        } else {
          subChunk += sent;
        }
      }
      if (subChunk) chunks.push(subChunk.trim());
    } else {
      if ((currentChunk + '\n\n' + trimmed).length > maxChars) {
        if (currentChunk) chunks.push(currentChunk.trim());
        currentChunk = trimmed;
      } else {
        currentChunk = currentChunk ? currentChunk + '\n\n' + trimmed : trimmed;
      }
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log('Usage: node scripts/ingest-documents.js <path-to-document-or-recipe-file>');
    process.exit(0);
  }

  const fileArg = args[0];
  const filePath = path.resolve(process.cwd(), fileArg);

  if (!fs.existsSync(filePath)) {
    console.error(`Error: File not found at ${filePath}`);
    process.exit(1);
  }

  const env = loadEnv();
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const storeId = env.STORE_ID || DEFAULT_STORE_ID;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Error: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be defined in .env');
    process.exit(1);
  }

  console.log(`Reading document: ${fileArg}...`);
  const content = fs.readFileSync(filePath, 'utf8');
  
  console.log('Chunking document content...');
  const chunks = chunkText(content);
  console.log(`Document split into ${chunks.length} chunk(s).`);

  const edgeUrl = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/ingest-document`;
  console.log(`Uploading to Edge function: ${edgeUrl}...`);

  let succeeded = 0;
  let failed = 0;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const chunkIndex = i + 1;
    
    console.log(`[${chunkIndex}/${chunks.length}] Ingesting chunk (${chunk.length} chars)...`);
    
    try {
      const response = await fetch(edgeUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${serviceRoleKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          content: chunk,
          store_id: storeId,
          metadata: {
            source: path.basename(filePath),
            chunkIndex,
            totalChunks: chunks.length,
            ingestedAt: new Date().toISOString()
          }
        })
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Server returned status ${response.status}: ${body}`);
      }

      const resJson = await response.json();
      if (resJson.ok) {
        succeeded++;
      } else {
        throw new Error(resJson.error || 'Unknown server error');
      }
    } catch (err) {
      console.error(`❌ Failed to ingest chunk ${chunkIndex}:`, err.message);
      failed++;
    }
  }

  console.log('\n════════════════ Ingestion Report ════════════════');
  console.log(`Total Chunks: ${chunks.length}`);
  console.log(`✅ Succeeded: ${succeeded}`);
  console.log(`❌ Failed:    ${failed}`);
  console.log('══════════════════════════════════════════════════');
}

main().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
