import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');

execSync(
  'pnpm exec esbuild src/widget/index.ts --bundle --minify --format=iife --loader:.css=text --outfile=public/widget.js',
  { cwd: rootDir, stdio: 'inherit' }
);

console.log('Built public/widget.js');
