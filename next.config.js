import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = process.env.NODE_ENV === 'development';
const buildHash = isDev ? 'dev' : `v-${Date.now().toString(36)}`;

// Generate version.json inside public/
try {
  const publicDir = path.join(__dirname, 'public');
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }
  fs.writeFileSync(
    path.join(publicDir, 'version.json'),
    JSON.stringify({ version: buildHash }, null, 2)
  );
  console.log(`[next.config.js] Generated version.json with build hash: ${buildHash}`);
} catch (err) {
  console.error('[next.config.js] Failed to generate version.json:', err);
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  distDir: 'dist',
  images: {
    unoptimized: true
  },
  env: {
    NEXT_PUBLIC_APP_BUILD_HASH: buildHash,
  }
};

export default nextConfig;
