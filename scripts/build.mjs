import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

function run(script, args = []) {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL(script, import.meta.url)), ...args], {
    cwd: fileURLToPath(new URL('../', import.meta.url)), stdio: 'inherit', windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
run('./run-framework.mjs', ['build']);
// The existing dashboard deploy command is "npx wrangler deploy". Prepare the
// additive schema before that upload, only in this Worker's production build.
// Ordinary local builds and GitHub CI never contact a remote database.
if (process.env.WORKERS_CI === '1' && process.env.WORKERS_CI_BRANCH === 'main') {
  run('./migrate-cloudflare.mjs');
}
