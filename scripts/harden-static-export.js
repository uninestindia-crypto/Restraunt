import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const outputDir = path.join(root, 'dist');
const inlineDir = path.join(outputDir, '_next', 'static', 'inline');

if (!fs.existsSync(outputDir)) {
  throw new Error('Static export directory is missing. Run next build first.');
}

function listHtmlFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? listHtmlFiles(fullPath) : entry.name.endsWith('.html') ? [fullPath] : [];
  });
}

fs.mkdirSync(inlineDir, { recursive: true });
let extractedCount = 0;

const EXECUTABLE_TYPES = ['text/javascript', 'application/javascript', 'module'];

function scriptType(rawAttributes) {
  return rawAttributes.match(/\btype\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase() || '';
}

/**
 * A typed block the browser never executes — structured data, import maps,
 * templates. The CSP's `script-src` does not apply to these, so they are safe
 * to leave inline and must not be mistaken for un-hardened bootstrap code.
 */
function isExecutable(rawAttributes) {
  const type = scriptType(rawAttributes);
  return !type || EXECUTABLE_TYPES.includes(type);
}

for (const htmlPath of listHtmlFiles(outputDir)) {
  const original = fs.readFileSync(htmlPath, 'utf8');
  const hardened = original.replace(/<script([^>]*)>([\s\S]*?)<\/script>/gi, (match, rawAttributes, body) => {
    if (/\bsrc\s*=/i.test(rawAttributes) || !body.trim()) return match;
    if (!isExecutable(rawAttributes)) return match;

    const digest = crypto.createHash('sha256').update(body).digest('hex').slice(0, 24);
    const filename = `${digest}.js`;
    fs.writeFileSync(path.join(inlineDir, filename), body, 'utf8');
    extractedCount += 1;
    return `<script${rawAttributes} src="/_next/static/inline/${filename}"></script>`;
  });

  for (const [, rawAttributes, body] of hardened.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (/\bsrc\s*=/i.test(rawAttributes) || !body.trim()) continue;
    if (isExecutable(rawAttributes)) {
      throw new Error(`Executable inline script remains in ${path.relative(root, htmlPath)}.`);
    }
  }

  fs.writeFileSync(htmlPath, hardened, 'utf8');
}

if (extractedCount === 0) {
  throw new Error('No inline scripts were extracted; the Next.js export format may have changed.');
}

console.log(`[security] Externalized ${extractedCount} inline Next.js bootstrap scripts.`);
