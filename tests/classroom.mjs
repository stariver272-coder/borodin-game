import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

// Exercise the production Worker through HTTP with isolated local D1 storage.
// No remote URL, account, API token, or existing room is used by this test.
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const config = join(root, 'dist/server/wrangler.json');
assert(existsSync(config), 'Build the application before running the classroom test.');
mkdirSync(join(root, '.sites-runtime'), { recursive: true });
const runtime = mkdtempSync(join(root, '.sites-runtime/classroom-'));
const persistence = join(runtime, 'state');
const cli = ['--import', pathToFileURL(join(root, 'scripts/sites-env.mjs')).href, join(root, 'node_modules/wrangler/bin/wrangler.js')];
const env = {
  ...process.env,
  SITES_RUNTIME_ROOT: runtime,
  CLOUDFLARE_CF_FETCH_ENABLED: 'false',
  WRANGLER_SEND_METRICS: 'false',
  WRANGLER_WRITE_LOGS: 'false',
};
const options = { cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] };

async function runWrangler(args) {
  const child = spawn(process.execPath, [...cli, ...args], options);
  let output = '';
  child.stdout.on('data', chunk => { output = (output + chunk).slice(-20000); });
  child.stderr.on('data', chunk => { output = (output + chunk).slice(-20000); });
  const [code] = await once(child, 'exit');
  assert.equal(code, 0, output);
}

for (const name of readdirSync(join(root, 'drizzle')).filter(name => name.endsWith('.sql')).sort()) {
  await runWrangler(['d1', 'execute', 'DB', '--local', '--config', config,
    '--persist-to', persistence, '--file', join(root, 'drizzle', name)]);
}

const reservation = createServer();
reservation.listen(0, '127.0.0.1');
await once(reservation, 'listening');
const port = reservation.address().port;
await new Promise(resolve => reservation.close(resolve));
const base = `http://127.0.0.1:${port}`;
const worker = spawn(process.execPath, [...cli, 'dev', '--config', config, '--local',
  '--persist-to', persistence, '--ip', '127.0.0.1', '--port', String(port),
  '--inspector-port', '0', '--log-level', 'error'], options);
let workerLog = '';
let workerError;
worker.on('error', error => { workerError = error; });
worker.stdout.on('data', chunk => { workerLog = (workerLog + chunk).slice(-20000); });
worker.stderr.on('data', chunk => { workerLog = (workerLog + chunk).slice(-20000); });
const latencies = [];

async function request(path, init = {}, expected = 200) {
  const start = performance.now();
  const response = await fetch(base + path, { ...init, signal: AbortSignal.timeout(30000) });
  const body = await response.json();
  latencies.push(performance.now() - start);
  assert.equal(response.status, expected, JSON.stringify(body));
  return body;
}
function action(body, session, expected = 200, owner = '') {
  return request('/api/room', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(session ? { Authorization: `Bearer ${session.token}` } : {}),
      ...(owner ? { 'oai-authenticated-user-id': owner } : {}),
    },
    body: JSON.stringify({ ...(session ? { code: session.code } : {}), ...body }),
  }, expected);
}
function state(session) {
  return request('/api/room?code=' + session.code, { headers: { Authorization: `Bearer ${session.token}` } });
}

try {
  const deadline = Date.now() + 60000;
  let ready = false;
  while (Date.now() < deadline) {
    if (workerError) throw workerError;
    assert(worker.exitCode === null, workerLog);
    try {
      const response = await fetch(base + '/api/room', { signal: AbortSignal.timeout(1000) });
      await response.arrayBuffer();
      if (response.status === 400) { ready = true; break; }
    } catch { /* Wait for the local Worker to start. */ }
    await delay(250);
  }
  assert(ready, 'Local Worker did not become ready.\n' + workerLog);
  const homepage = await fetch(base, { signal: AbortSignal.timeout(30000) });
  assert.equal(homepage.status, 200);
  assert.match(await homepage.text(), /鲍罗廷/);

  const host = await action({ action: 'create', title: '30 人课堂验证' }, null, 200, 'classroom-test-owner');
  const players = await Promise.all(Array.from({ length: 30 }, (_, index) =>
    action({ action: 'join', code: host.code, name: `同学${index + 1}` })));
  assert.equal(new Set(players.map(player => player.token)).size, 30);
  let current = await state(host);
  assert.equal(current.players.length, 30);
  assert.equal(new Set(current.players.map(player => player.id)).size, 30);
  assert.equal(current.role, 'host');
  async function control(command) {
    current = await action({ action: 'control', command, version: current.room.version }, host);
  }
  await control('start');
  const story = JSON.parse(readFileSync(join(root, 'content/story.json'), 'utf8'));
  const expectedResults = {};

  for (let step = 0; step < story.scenes.length; step++) {
    while (current.room.step < step) await control('next');
    const scene = story.scenes[step];
    if (scene.type !== 'poll') continue;
    const poll = scene.poll;
    const [first, second] = story.polls[poll].options.map(option => option.key);
    assert(first && second, `Expected two options in ${poll}`);
    await control('open');
    const choices = players.map((_, index) => index < 20 ? first : second);

    // Three synchronized polling waves, matching the browser's 2.5s interval.
    for (let wave = 0; wave < 3; wave++) {
      if (wave) await delay(2500);
      const snapshots = await Promise.all([host, ...players].map(state));
      for (const snapshot of snapshots) {
        assert.equal(snapshot.players.length, 30);
        assert.equal(snapshot.room.version, current.room.version);
        assert.equal(snapshot.room.phase, 'open');
        assert.equal(snapshot.results[poll], undefined);
      }
    }

    await Promise.all(players.map((player, index) => action({
      action: 'vote', poll, choice: choices[index], reason: `理由${index + 1}`,
    }, player)));
    current = await state(host);
    assert.equal(current.submitted, 30);
    assert.equal(current.results[poll], undefined);
    // Resending the same vote and changing it must never create extra ballots.
    await Promise.all(players.map((player, index) => action({
      action: 'vote', poll, choice: choices[index], reason: `理由${index + 1}`,
    }, player)));
    await Promise.all(players.slice(0, 10).map((player, index) => {
      choices[index] = second;
      return action({ action: 'vote', poll, choice: second, reason: `修改理由${index + 1}` }, player);
    }));
    const restored = await Promise.all(players.map(state));
    restored.forEach((snapshot, index) => {
      assert.equal(snapshot.role, 'player');
      assert.equal(snapshot.myVote.choice, choices[index]);
      assert.equal(snapshot.submitted, 30);
      assert.equal(snapshot.results[poll], undefined);
    });
    await control('close');
    const expectedCounts = { [first]: 10, [second]: 20 };
    assert.deepEqual(current.results[poll].counts, expectedCounts);
    assert.equal(current.results[poll].total, 30);
    assert.equal(current.results[poll].reasons.length, 30);
    assert.deepEqual(current.results[poll].winners, [second]);
    assert.equal(current.results[poll].reasons.filter(item => item.reason.startsWith('修改理由')).length, 10);
    const closed = await Promise.all([host, ...players].map(state));
    for (const snapshot of closed) assert.deepEqual(snapshot.results[poll], current.results[poll]);
    await Promise.all(players.map(player => action({ action: 'vote', poll, choice: first }, player, 409)));
    expectedResults[poll] = current.results[poll];
    console.log(`PASS: ${poll}: 30 players, duplicate retries, 10 changes, counts 10/20, consistent results and closed-vote rejection.`);
  }
  assert.equal(Object.keys(expectedResults).length, 4);
  await control('finish');
  const exported = await action({ action: 'export' }, host);
  assert.deepEqual(exported.results, expectedResults);
  assert.equal(exported.room.status, 'finished');
  await action({ action: 'join', code: host.code, name: '迟到同学' }, null, 400);
  const sorted = [...latencies].sort((a, b) => a - b);
  console.log(`PASS: 30 independent players and 1 host; 4 polls / 120 final ballots; ${latencies.length} HTTP API requests.`);
  console.log(`Local HTTP latency: p95=${Math.round(sorted[Math.ceil(sorted.length * 0.95) - 1])}ms, max=${Math.round(sorted.at(-1))}ms. This is a local Worker test, not a production network load test.`);
} catch (error) {
  if (workerLog) console.error(workerLog);
  throw error;
} finally {
  if (worker.pid && worker.exitCode === null) {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/PID', String(worker.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    } else {
      worker.kill('SIGTERM');
      const exited = await Promise.race([once(worker, 'exit').then(() => true), delay(5000).then(() => false)]);
      if (!exited) worker.kill('SIGKILL');
    }
  }
}
