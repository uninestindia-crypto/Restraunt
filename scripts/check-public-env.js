import fs from 'fs';
import path from 'path';

const FRONTEND_ENV_FILES = [
  '.env',
  '.env.local',
  '.env.production',
  '.env.production.local',
  '.env.development',
  '.env.development.local',
  '.env.test',
  '.env.test.local'
];

const FORBIDDEN_KEYS = new Set([
  'SUPABASE_SERVICE_ROLE_KEY',
  'ADMIN_PASSWORD',
  'ADMIN_PIN',
  'GROQ_API_KEY',
  'LIGHTNING_API_KEY',
  'OPENAI_API_KEY',
  'GOOGLE_CLIENT_SECRET'
]);

const violations = [];
for (const filename of FRONTEND_ENV_FILES) {
  const filePath = path.resolve(process.cwd(), filename);
  if (!fs.existsSync(filePath)) continue;
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  lines.forEach((line, index) => {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (match && FORBIDDEN_KEYS.has(match[1])) {
      violations.push(`${filename}:${index + 1} (${match[1]})`);
    }
  });
}

if (violations.length) {
  console.error('[security] Privileged variables found in frontend environment files:');
  violations.forEach(violation => console.error(`- ${violation}`));
  console.error('[security] Move them to .env.admin.local or the deployment secret manager.');
  process.exit(1);
}

console.log('[security] Frontend environment contains no privileged server keys.');
