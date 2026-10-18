import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const configPath = new URL('../dist/server/wrangler.json', import.meta.url);
const config = JSON.parse(readFileSync(configPath, 'utf8'));
const database = config.d1_databases?.find(binding => binding.binding === 'DB');
if (config.name !== 'borodin-game' || config.vars?.AUTH_MODE !== 'password'
    || !database?.database_id || database.database_id === '00000000-0000-4000-8000-000000000000') {
  throw new Error('Build the independent Cloudflare application before upgrading its database.');
}
// Existing installations initialized the first six tables manually. Do not
// replay those historical migrations; this additive upgrade is repeatable.
const result = spawnSync(process.execPath, [
  '--import', new URL('./sites-env.mjs', import.meta.url).href,
  fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url)),
  'd1', 'execute', 'DB', '--remote', '--config', fileURLToPath(configPath),
  '--file', fileURLToPath(new URL('../drizzle/0002_host_presence.sql', import.meta.url)),
], {cwd: fileURLToPath(new URL('../', import.meta.url)), stdio: 'inherit', windowsHide: true, env: {...process.env, CI: 'true'}});
if (result.error) throw result.error;
if (result.status !== 0) {
  console.error('Host-presence database upgrade failed; deployment has been stopped. The build API token needs D1 Edit permission. Existing rooms and votes are unchanged.');
  process.exit(result.status ?? 1);
}
