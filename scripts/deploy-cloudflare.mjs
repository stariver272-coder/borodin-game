import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const config = JSON.parse(readFileSync(new URL('../dist/server/wrangler.json', import.meta.url), 'utf8'));
const database = config.d1_databases?.find(binding => binding.binding === 'DB');
if (config.name !== 'borodin-game' || config.vars?.AUTH_MODE !== 'password'
    || !database?.database_id || database.database_id === '00000000-0000-4000-8000-000000000000') {
  throw new Error('Run pnpm run build:cloudflare with your real D1 Database ID before deploying.');
}
const result = spawnSync(process.execPath, [
  '--import', new URL('./sites-env.mjs', import.meta.url).href,
  fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url)),
  'deploy', '--config', 'dist/server/wrangler.json',
], { cwd: root, stdio: 'inherit', windowsHide: true });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
