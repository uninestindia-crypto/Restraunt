import fs from 'node:fs';
import { execSync } from 'node:child_process';

if (fs.existsSync('.git')) {
  try {
    execSync('git config core.hooksPath .githooks', { stdio: 'inherit' });
    console.log('Git hooks path configured to .githooks');
  } catch (err) {
    console.warn('Could not set git hooksPath:', err.message);
  }
} else {
  console.log('Not a git repository (e.g. Vercel build). Skipping git hooks setup.');
}
