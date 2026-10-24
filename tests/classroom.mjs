import '../scripts/sites-env.mjs';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

// Exercise the production Worker through HTTP with isolated local D1 storage.
// No remote URL, account, API token, or existing room is used by this test.
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const story = JSON.parse(readFileSync(join(root, 'content/story.json'), 'utf8'));
const builtConfig = join(root, 'dist/server/wrangler.json');
assert(existsSync(builtConfig), 'Build the application before running the classroom test.');
mkdirSync(join(root, '.sites-runtime'), { recursive: true });
const runtime = mkdtempSync(join(root, '.sites-runtime/classroom-'));
const config = join(runtime, 'wrangler.json');
const testPassword = crypto.randomUUID() + crypto.randomUUID();
const settings = JSON.parse(readFileSync(builtConfig, 'utf8'));
assert.equal(settings.name, 'borodin-game', 'The default build must target the independent Worker.');
assert(!settings.r2_buckets?.some(binding => binding.bucket_name === 'site-creator-r2'), 'Independent deployments must not bind the original Sites R2 bucket.');
assert.equal(settings.vars?.AUTH_MODE, 'password', 'The local classroom test requires the independent password-authenticated build.');
settings.main = resolve(dirname(builtConfig), settings.main);
if (settings.assets?.directory) settings.assets.directory = resolve(dirname(builtConfig), settings.assets.directory);
// This random credential is for this disposable local test only.
settings.vars = { ...settings.vars, HOST_PASSWORD: testPassword };
writeFileSync(config, JSON.stringify(settings));
// Exercise the built Worker over real HTTP without the Wrangler CLI's extra
// development proxy. Keep all requests concurrent and retain the 30s timeout.
const require = createRequire(import.meta.url);
const { unstable_getMiniflareWorkerOptions } = require('wrangler');
const { Miniflare, Log, LogLevel } = require(require.resolve('miniflare', { paths: [require.resolve('wrangler')] }));
const { workerOptions, externalWorkers } = unstable_getMiniflareWorkerOptions(config);
const moduleRoot = dirname(settings.main);
const modules = [{ type: 'ESModule', path: settings.main }, ...readdirSync(moduleRoot, { recursive: true })
  .filter(name => /\.m?js$/.test(name) && name !== 'index.js')
  .map(name => ({ type: 'ESModule', path: join(moduleRoot, name) }))];
const mf = new Miniflare({ host: '127.0.0.1', port: 0, cf: false, inspectorPort: 0,
  log: new Log(LogLevel.WARN), d1Persist: false,
  workers: [{ ...workerOptions, modules, modulesRoot: moduleRoot }, ...externalWorkers] });
let base;
try {
  base = String(await mf.ready).replace(/\/$/, '');
  const db = await mf.getD1Database('DB');
  for (const name of readdirSync(join(root, 'drizzle')).filter(name => name.endsWith('.sql')).sort()) {
    for (const sql of readFileSync(join(root, 'drizzle', name), 'utf8').split('--> statement-breakpoint').filter(sql => sql.trim())) {
      await db.prepare(sql).run();
    }
  }
} catch (error) { await mf.dispose(); throw error; }
const latencies = [];
let hostCookie = '';

async function request(path, init = {}, expected = 200) {
  const start = performance.now();
  const response = await fetch(base + path, { ...init, signal: AbortSignal.timeout(30000) });
  const body = await response.json();
  latencies.push(performance.now() - start);
  assert.equal(response.status, expected, JSON.stringify(body));
  return body;
}
function action(body, session, expected = 200) {
  return request('/api/room', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(session ? { Authorization: `Bearer ${session.token}` } : {}),
      ...(body.action === 'create' || session?.role === 'host' ? { Cookie: hostCookie } : {}),
    },
    body: JSON.stringify({ ...(session ? { code: session.code } : {}), ...body }),
  }, expected);
}
function state(session) {
  return request('/api/room?code=' + session.code, { headers: { Authorization: `Bearer ${session.token}` } });
}

try {
  const health = await fetch(base + '/api/room', { signal: AbortSignal.timeout(30000) });
  await health.arrayBuffer();
  assert.equal(health.status, 400, 'The room API should reject a request without a room code.');
  const homepage = await fetch(base, { signal: AbortSignal.timeout(30000) });
  assert.equal(homepage.status, 200);
  assert((await homepage.text()).includes(story.title.split('：')[0]));

  const loginPage = await fetch(base + '/host/login');
  assert.equal(loginPage.status, 200);assert.match(await loginPage.text(), /主持人登录/);
  await request('/api/room', {method:'POST',headers:{'Content-Type':'application/json','oai-authenticated-user-id':'spoofed-owner'},body:JSON.stringify({action:'create'})}, 401);
  const login = await fetch(base + '/api/host/session', {method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify({password:testPassword})});
  assert.equal(login.status, 200);hostCookie=login.headers.get('set-cookie').split(';')[0];
  const signedHomepage=await fetch(base,{headers:{Cookie:hostCookie}});assert.equal(signedHomepage.status,200);
  assert.doesNotMatch(await signedHomepage.text(), /href="\/host\/login"/);
  const host = await action({ action: 'create', title: '30 人课堂验证' }, null);
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
  const expectedResults = {};

  for (let step = 0; step < story.scenes.length; step++) {
    const scene = story.scenes[step];
    if (scene.type !== 'poll') continue;
    if(scene.act>1){
      assert.equal(current.waitingAct,scene.act);
      const boundary=story.scenes.findIndex(item=>item.act===scene.act)-1;
      await Promise.all(players.map(async player=>{
        let snapshot=await state(player);
        while(snapshot.reading.step<boundary)snapshot=await action({action:'read',direction:'next',version:snapshot.reading.version},player);
        assert.equal(snapshot.reading.limit,boundary);
        await action({action:'read',direction:'next',version:snapshot.reading.version},player,409);
        await action({action:'control',command:'unlock-act',version:current.room.version},player,403);
      }));
      await action({action:'control',command:'open',version:current.room.version},host,409);
      await control('unlock-act');
      assert.equal(current.room.unlockedAct,scene.act);assert.equal(current.waitingAct,null);
      const unlocked=await Promise.all(players.map(state));
      for(const snapshot of unlocked){assert.equal(snapshot.reading.step,boundary);assert.equal(snapshot.reading.limit,step);}
      console.log(`PASS: act ${scene.act} held 30 readers until host unlock; unlock preserves individual positions.`);
    }
    const poll = scene.poll;
    const [first, second] = story.polls[poll].options.map(option => option.key);
    assert(first && second, `Expected two options in ${poll}`);
    async function reachVote(player) {
      let snapshot=await state(player);
      while(snapshot.reading.step<step) snapshot=await action({action:'read',direction:'next',version:snapshot.reading.version},player);
      assert.equal(snapshot.reading.step,step);
    }
    await Promise.all(players.slice(0,15).map(reachVote));
    current=await state(host);assert.equal(current.arrived,15);
    await Promise.all(players.slice(15).map(reachVote));
    current=await state(host);assert.equal(current.arrived,30);
    assert.equal(current.reading.step,0,'Participant navigation must not move the host.');
    assert.equal(current.waitingPoll,poll);
    await control('open');
    const choices = players.map((_, index) => index < 20 ? first : second);

    // Three synchronized polling waves, matching the browser's 5s interval.
    for (let wave = 0; wave < 3; wave++) {
      if (wave) await delay(5000);
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
    for (const snapshot of closed) { assert.deepEqual(snapshot.results[poll], current.results[poll]); assert.equal(snapshot.arrived,0); }
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
} finally {
  await mf.dispose();
}
