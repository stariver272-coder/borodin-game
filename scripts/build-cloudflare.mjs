import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Database IDs identify a binding; Cloudflare still requires account authorization.
const databaseId = process.env.BORODIN_D1_DATABASE_ID ?? '95db5a47-b245-4ffa-a2b3-477408f52a85';
if (!databaseId || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(databaseId)
    || databaseId === '00000000-0000-4000-8000-000000000000') {
  throw new Error('Set BORODIN_D1_DATABASE_ID to the Database ID of your existing Cloudflare D1 database before building for deployment.');
}
const bucket = process.env.BORODIN_R2_BUCKET;
if (bucket && !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket)) {
  throw new Error('BORODIN_R2_BUCKET must be an existing R2 bucket name. Leave it unset to use built-in character images.');
}
const result = spawnSync(process.execPath, [fileURLToPath(new URL('./run-framework.mjs', import.meta.url)), 'build'], {
  cwd: fileURLToPath(new URL('../', import.meta.url)),
  env: { ...process.env, BORODIN_DEPLOY_TARGET: 'cloudflare', BORODIN_D1_DATABASE_ID: databaseId },
  stdio: 'inherit', windowsHide: true,
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
