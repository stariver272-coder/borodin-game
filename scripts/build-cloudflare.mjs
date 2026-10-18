import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Database IDs identify a binding; Cloudflare still requires account authorization.
const deploymentConfig = JSON.parse(readFileSync(new URL('../deployment/cloudflare.json', import.meta.url), 'utf8'));
const databaseId = process.env.BORODIN_D1_DATABASE_ID ?? deploymentConfig.database_id;
if (!databaseId || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(databaseId)
    || databaseId === '00000000-0000-4000-8000-000000000000') {
  throw new Error('Set BORODIN_D1_DATABASE_ID to the Database ID of your existing Cloudflare D1 database before building for deployment.');
}
const bucket = process.env.BORODIN_R2_BUCKET;
if (bucket && !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket)) {
  throw new Error('BORODIN_R2_BUCKET must be an existing R2 bucket name. Leave it unset to use built-in character images.');
}
const result = spawnSync(process.execPath, [fileURLToPath(new URL('./build.mjs', import.meta.url))], {
  cwd: fileURLToPath(new URL('../', import.meta.url)),
  env: { ...process.env, BORODIN_DEPLOY_TARGET: 'cloudflare', BORODIN_D1_DATABASE_ID: databaseId },
  stdio: 'inherit', windowsHide: true,
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
